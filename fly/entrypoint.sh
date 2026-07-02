#!/bin/bash
# Box Claws Fly.io entrypoint.
# 1. Start dockerd with data-root on the persistent volume (/data/docker)
# 2. Start the dashboard API (+ VNC proxy) immediately so health checks pass
# 3. Ensure openclaw/agentbox:full exists in the background (pull from
#    $AGENTBOX_IMAGE_REF if set, otherwise build from docker/Dockerfile.full;
#    cached in the volume, so this only costs time on first boot)
set -uo pipefail

echo "=== Box Claws on Fly.io ==="
mkdir -p /data/docker /data/.agentbox/openclaw /data/log

# --- 1. dockerd ---
# Fly's network is IPv6-first (e.g. deb.debian.org resolves to IPv6-only
# addrs); without IPv6 NAT on the docker bridge, apt/npm inside containers
# can't reach those hosts. Enable IPv6 + NAT66.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "data-root": "/data/docker",
  "ipv6": true,
  "fixed-cidr-v6": "fd00:d0c6::/64",
  "ip6tables": true,
  "experimental": true
}
EOF

if ! pgrep -x dockerd >/dev/null 2>&1; then
  echo "[init] starting dockerd (data-root=/data/docker, ipv6 NAT enabled)"
  dockerd >>/data/log/dockerd.log 2>&1 &
fi

for _ in $(seq 1 60); do
  docker info >/dev/null 2>&1 && break
  sleep 1
done
if ! docker info >/dev/null 2>&1; then
  echo "[init] FATAL: dockerd did not come up; last log lines:"
  tail -n 50 /data/log/dockerd.log || true
  exit 1
fi
echo "[init] dockerd ready ($(docker info --format '{{.ServerVersion}}' 2>/dev/null))"

# --- 2. ensure agent image (background; progress goes to machine logs) ---
(
  if docker image inspect openclaw/agentbox:full >/dev/null 2>&1; then
    echo "[image] openclaw/agentbox:full already present (cached in volume)"
    exit 0
  fi
  if [ -n "${AGENTBOX_IMAGE_REF:-}" ]; then
    echo "[image] pulling ${AGENTBOX_IMAGE_REF} ..."
    if docker pull "${AGENTBOX_IMAGE_REF}"; then
      docker tag "${AGENTBOX_IMAGE_REF}" openclaw/agentbox:full
      echo "[image] pulled and tagged as openclaw/agentbox:full"
      exit 0
    fi
    echo "[image] pull failed, falling back to local build"
  fi
  echo "[image] building openclaw/agentbox:full from docker/Dockerfile.full (first boot — takes several minutes)..."
  if docker build -f /app/docker/Dockerfile.full -t openclaw/agentbox:full /app/docker; then
    echo "[image] build complete — box deploys are now possible"
  else
    echo "[image] ERROR: build FAILED — box creation will fail until this is fixed"
  fi
) &

# --- 3. dashboard API + VNC proxy ---
# HOME=/data (set in fly.toml [env]) puts box state at /data/.agentbox/openclaw
echo "[init] starting dashboard API on :3457 (VNC proxy on :${VNC_PROXY_PORT:-8080} if VNC_PROXY_TOKEN is set)"
exec node /app/fly/start-server.mjs
