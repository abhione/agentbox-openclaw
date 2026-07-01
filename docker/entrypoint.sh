#!/bin/bash
set -e

# Initialize OpenClaw config if provided via env
if [ -n "$OPENCLAW_CONFIG" ]; then
    mkdir -p /home/agent/.openclaw
    echo "$OPENCLAW_CONFIG" > /home/agent/.openclaw/openclaw.json
    chown -R agent:agent /home/agent/.openclaw 2>/dev/null || true
fi

# Set VNC password (empty = no password for internal use)
mkdir -p /home/agent/.vnc
touch /home/agent/.vnc/passwd
chmod 600 /home/agent/.vnc/passwd 2>/dev/null || true
chown -R agent:agent /home/agent/.vnc 2>/dev/null || true

# Start VNC and noVNC
echo "Starting VNC server..."

# Start VNC with insecure flag (internal network only)
su - agent -c "vncserver :1 -geometry 1920x1080 -depth 24 -SecurityTypes None -localhost no --I-KNOW-THIS-IS-INSECURE" &
sleep 3

# Start noVNC proxy in background
echo "Starting noVNC proxy..."
su - agent -c "/usr/share/novnc/utils/novnc_proxy --vnc localhost:5901 --listen 6080 2>&1" &
sleep 2

# Main loop - keep container alive and show activity
echo "AgentBox container ready!"
echo "  VNC: port 5901"
echo "  noVNC: port 6080"

# Run an xterm showing system info
su - agent -c "DISPLAY=:1 xterm -geometry 100x30+50+50 -title 'AgentBox Terminal' -e 'echo AgentBox Ready && echo && echo VNC Display :1 && echo noVNC http://localhost:6080 && echo && bash'" &

# Keep container running
exec tail -f /dev/null
