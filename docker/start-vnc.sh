#!/bin/bash
# Start VNC server with noVNC web interface

VNC_PORT=${VNC_PORT:-5901}
NOVNC_PORT=${NOVNC_PORT:-6080}
VNC_RESOLUTION=${VNC_RESOLUTION:-1920x1080}
VNC_DEPTH=${VNC_DEPTH:-24}

echo "[vnc] Starting VNC server on :1 (port $VNC_PORT)"

# Kill any existing VNC sessions
vncserver -kill :1 2>/dev/null || true

# Create VNC password (empty for no auth, or use VNC_PASSWORD env)
mkdir -p ~/.vnc
if [ -n "$VNC_PASSWORD" ]; then
    echo "$VNC_PASSWORD" | vncpasswd -f > ~/.vnc/passwd
    chmod 600 ~/.vnc/passwd
else
    # No password (for internal use)
    touch ~/.vnc/passwd
    chmod 600 ~/.vnc/passwd
fi

# VNC startup script
cat > ~/.vnc/xstartup << 'EOF'
#!/bin/bash
export XDG_SESSION_TYPE=x11
fluxbox &
xterm -geometry 120x40 &
EOF
chmod +x ~/.vnc/xstartup

# Start VNC server
vncserver :1 \
    -geometry $VNC_RESOLUTION \
    -depth $VNC_DEPTH \
    -SecurityTypes None \
    -localhost no

# Start noVNC websocket proxy
echo "[vnc] Starting noVNC on port $NOVNC_PORT"
websockify --web=/usr/share/novnc/ $NOVNC_PORT localhost:$VNC_PORT &

echo "[vnc] VNC ready"
echo "[vnc] Direct VNC: localhost:$VNC_PORT"
echo "[vnc] Web VNC: http://localhost:$NOVNC_PORT/vnc.html"

# Keep running
wait
