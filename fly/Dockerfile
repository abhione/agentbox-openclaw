# Box Claws host VM for Fly.io
# Runs dockerd (Docker-in-VM, same approach as Fly remote builders) + the
# Box Claws dashboard API (:3457, private) + VNC proxy (:8080, public).
FROM node:22-bookworm

# Docker engine (official repo — bookworm's docker.io is ancient)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg git procps iptables uidmap \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian bookworm stable" \
       > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build && chmod +x fly/entrypoint.sh

# 3457 = dashboard API (private networking only — NEVER map publicly)
# 8080 = token-guarded VNC proxy (the only public service)
EXPOSE 3457 8080

ENTRYPOINT ["/app/fly/entrypoint.sh"]
