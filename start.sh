#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "🔭 Starting Agent Observatory..."

# Kill any existing processes
pkill -f "next dev.*3456" 2>/dev/null || true
lsof -ti:3456 -ti:3457 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# Start API server on 3457
echo "Starting API server on port 3457..."
node -e "
import('./dist/index.js').then(m => {
  new m.DashboardServer({ port: 3457 }).start();
});
" &
API_PID=$!

sleep 2

# Verify API is up
if ! curl -s http://localhost:3457/health > /dev/null; then
  echo "❌ API server failed to start"
  exit 1
fi
echo "✓ API server running"

# Start Next.js dashboard on 3456
echo "Starting dashboard on port 3456..."
cd dashboard
pnpm dev -p 3456 &
DASH_PID=$!
cd ..

sleep 3

echo ""
echo "════════════════════════════════════════════"
echo "  🔭 Agent Observatory is running!"
echo "════════════════════════════════════════════"
echo ""
echo "  Dashboard:  http://localhost:3456"
echo "  API:        http://localhost:3457"
echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Handle shutdown
trap "echo 'Shutting down...'; kill $API_PID $DASH_PID 2>/dev/null; exit 0" INT TERM

# Wait
wait
