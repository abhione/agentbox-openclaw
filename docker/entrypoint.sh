#!/bin/bash
set -e

# Initialize OpenClaw config if provided via env
if [ -n "$OPENCLAW_CONFIG" ]; then
    mkdir -p /home/agent/.openclaw
    echo "$OPENCLAW_CONFIG" > /home/agent/.openclaw/openclaw.json
    chown -R agent:agent /home/agent/.openclaw
fi

# Set VNC password (empty = no password for internal use)
mkdir -p /home/agent/.vnc
echo "" | vncpasswd -f > /home/agent/.vnc/passwd 2>/dev/null || true
chmod 600 /home/agent/.vnc/passwd 2>/dev/null || true
chown -R agent:agent /home/agent/.vnc

# If VNC is enabled, start supervisor (manages all services)
if [ "${VNC_ENABLED:-true}" = "true" ]; then
    exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
else
    # Just run openclaw directly
    exec su - agent -c "cd /workspace && $*"
fi
