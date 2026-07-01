#!/bin/bash
set -e

echo "╔═══════════════════════════════════════════╗"
echo "║     🔭 Agent Observatory Container        ║"
echo "╚═══════════════════════════════════════════╝"

# Initialize OpenClaw config if provided via env
if [ -n "$OPENCLAW_CONFIG" ]; then
    echo "📝 Injecting OpenClaw config..."
    mkdir -p /home/agent/.openclaw
    echo "$OPENCLAW_CONFIG" > /home/agent/.openclaw/openclaw.json
    chown -R agent:agent /home/agent/.openclaw 2>/dev/null || true
fi

# Create workspace directories
mkdir -p /home/agent/workspace/memory
chown -R agent:agent /home/agent/workspace 2>/dev/null || true

# Set VNC password (empty = no password for internal use)
mkdir -p /home/agent/.vnc
touch /home/agent/.vnc/passwd
chmod 600 /home/agent/.vnc/passwd 2>/dev/null || true
chown -R agent:agent /home/agent/.vnc 2>/dev/null || true

# Create log file
touch /tmp/openclaw.log
chown agent:agent /tmp/openclaw.log

echo "🖥️  Starting VNC server..."
su - agent -c "vncserver :1 -geometry 1920x1080 -depth 24 -SecurityTypes None -localhost no --I-KNOW-THIS-IS-INSECURE" &
sleep 3

echo "🌐 Starting noVNC proxy..."
su - agent -c "/usr/share/novnc/utils/novnc_proxy --vnc localhost:5901 --listen 6080 2>&1 | tee /tmp/novnc.log" &
sleep 2

# Start OpenClaw gateway
if [ -f /home/agent/.openclaw/openclaw.json ]; then
    echo "🚀 Starting OpenClaw gateway..."
    
    # Validate config first
    su - agent -c "cd /home/agent/workspace && openclaw config validate 2>&1" || true
    
    # Start gateway in background
    su - agent -c "cd /home/agent/workspace && openclaw gateway run --bind lan 2>&1 | tee /tmp/openclaw.log" &
    GATEWAY_PID=$!
    
    sleep 5
    
    # Check if gateway started
    if curl -s http://localhost:18789/health > /dev/null 2>&1; then
        echo "✅ OpenClaw gateway started successfully"
    else
        echo "⚠️  Gateway may still be starting, check /tmp/openclaw.log"
        tail -20 /tmp/openclaw.log
    fi
else
    echo "⚠️  No OpenClaw config found at /home/agent/.openclaw/openclaw.json"
fi

# Open terminal showing gateway logs
su - agent -c "DISPLAY=:1 xterm -geometry 120x30+10+10 -title 'OpenClaw Gateway Logs' -e 'tail -f /tmp/openclaw.log'" &

echo ""
echo "════════════════════════════════════════════"
echo "  ✅ AgentBox container ready!"
echo "════════════════════════════════════════════"
echo ""
echo "  VNC:     port 5901"
echo "  noVNC:   port 6080"
echo "  Gateway: port 18789"
echo "  Browser: port 18800"
echo ""

# Keep container running
exec tail -f /dev/null
