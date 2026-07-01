# 🔭 Agent Observatory

**Zoom for AI Agents** — Deploy, monitor, and watch OpenClaw agents work in real-time through VNC screen sharing.

![Agent Observatory](https://img.shields.io/badge/status-beta-yellow) ![Docker](https://img.shields.io/badge/docker-required-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## Features

- 🖥️ **Live Screen Sharing** — Watch agents work in real-time via noVNC
- 📋 **Agent Management** — Deploy, start, stop, destroy agents from a web UI
- 🔐 **Multi-Provider Auth** — Anthropic, OpenAI, AWS Bedrock, Ollama
- 📡 **Activity Feed** — Real-time WebSocket events
- 🐳 **Docker Isolation** — Each agent runs in its own container
- 🎯 **One-Click Deploy** — Guided onboarding wizard

## Quick Start

```bash
# Clone the repo
git clone https://github.com/abhione/agentbox-openclaw.git
cd agentbox-openclaw

# Install dependencies
pnpm install

# Build
pnpm build

# Build Docker image
cd docker && docker build -f Dockerfile.full -t openclaw/agentbox:full .
cd ..

# Start the dashboard
./start.sh
# → Dashboard: http://localhost:3456
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Observatory                         │
│                   http://localhost:3456                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────────────────────────────┐  │
│  │  Agent List │  │         VNC Screen Viewer           │  │
│  │             │  │    (embedded noVNC iframe)          │  │
│  │  🟢 agent-1 │  │                                     │  │
│  │  ⚪ agent-2 │  │    ┌─────────────────────────┐      │  │
│  │  🟢 agent-3 │  │    │                         │      │  │
│  │             │  │    │   Live Agent Desktop    │      │  │
│  │ [+ Deploy]  │  │    │                         │      │  │
│  └─────────────┘  │    └─────────────────────────┘      │  │
│                   └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Docker Containers                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  agentbox-alpha │  │  agentbox-beta  │  ...              │
│  │  ┌───────────┐  │  │  ┌───────────┐  │                   │
│  │  │  OpenClaw │  │  │  │  OpenClaw │  │                   │
│  │  │  Gateway  │  │  │  │  Gateway  │  │                   │
│  │  └───────────┘  │  │  └───────────┘  │                   │
│  │  ┌───────────┐  │  │  ┌───────────┐  │                   │
│  │  │ VNC + X11 │  │  │  │ VNC + X11 │  │                   │
│  │  │  Desktop  │  │  │  │  Desktop  │  │                   │
│  │  └───────────┘  │  │  └───────────┘  │                   │
│  │  ┌───────────┐  │  │  ┌───────────┐  │                   │
│  │  │  noVNC    │──┼──│  │  noVNC    │  │                   │
│  │  │  Proxy    │  │  │  │  Proxy    │  │                   │
│  │  └───────────┘  │  │  └───────────┘  │                   │
│  └─────────────────┘  └─────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## Port Allocation

Each agent gets 4 ports, starting at 19000:

| Port | Service | Description |
|------|---------|-------------|
| base+0 | Gateway | OpenClaw API (18789 internal) |
| base+1 | Browser Control | Playwright CDP (18791 internal) |
| base+2 | VNC | TigerVNC server (5901 internal) |
| base+3 | noVNC | Web-based VNC client (6080 internal) |

Example for first agent: `19000` (gateway), `19001` (browser), `19002` (vnc), `19003` (novnc)

## Dashboard API

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/boxes` | List all agents |
| GET | `/api/boxes/:id` | Get agent details |
| POST | `/api/boxes` | Create new agent |
| POST | `/api/boxes/:id/start` | Start agent |
| POST | `/api/boxes/:id/stop` | Stop agent |
| DELETE | `/api/boxes/:id` | Destroy agent |
| POST | `/api/boxes/:id/exec` | Execute command in agent |
| GET | `/api/boxes/:id/vnc` | Get VNC connection info |

### WebSocket

Connect to `ws://localhost:3456` for real-time events:

```javascript
const ws = new WebSocket('ws://localhost:3456');

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // msg.type: 'init', 'box:created', 'box:started', 'box:stopped', 'activity'
};

// Subscribe to agent activity
ws.send(JSON.stringify({ type: 'subscribe', boxId: 'agent-id' }));
```

## Creating an Agent

### Via Dashboard UI

1. Open http://localhost:3456
2. Click **"+ Deploy Agent"**
3. Follow the onboarding wizard:
   - **Step 1:** Name your agent, choose LLM provider
   - **Step 2:** Enter API credentials
   - **Step 3:** Select model, optionally add Telegram bot
4. Click **"🚀 Deploy Agent"**

### Via API

```bash
curl -X POST http://localhost:3456/api/boxes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "openclawConfig": {
      "gateway": { "mode": "local", "port": 18789, "bind": "0.0.0.0" },
      "models": { "default": "anthropic/claude-sonnet-4-20250514" },
      "auth": { "anthropic": { "apiKey": "sk-ant-..." } },
      "tools": { "exec": { "enabled": true }, "browser": { "enabled": true } },
      "channels": {}
    }
  }'
```

### Via CLI

```bash
# Deploy with defaults
claw-box deploy --name my-agent

# Deploy with specific model
claw-box deploy --name my-agent --model anthropic/claude-opus-4-5

# List agents
claw-box list

# Check status
claw-box status my-agent

# Open VNC in browser
claw-box vnc my-agent

# Stop agent
claw-box stop my-agent

# Destroy agent
claw-box destroy my-agent
```

## LLM Provider Configuration

### Anthropic (Claude)

```json
{
  "auth": {
    "anthropic": { "apiKey": "sk-ant-..." }
  },
  "models": {
    "default": "anthropic/claude-sonnet-4-20250514"
  }
}
```

### OpenAI (GPT)

```json
{
  "auth": {
    "openai": { "apiKey": "sk-..." }
  },
  "models": {
    "default": "openai/gpt-4o"
  }
}
```

### AWS Bedrock

```json
{
  "auth": {
    "bedrock": {
      "accessKeyId": "AKIA...",
      "secretAccessKey": "...",
      "region": "us-east-1"
    }
  },
  "models": {
    "default": "bedrock/us.anthropic.claude-sonnet-4-20250514-v1:0"
  }
}
```

### Ollama (Local)

```json
{
  "auth": {
    "ollama": { "host": "http://host.docker.internal:11434" }
  },
  "models": {
    "default": "ollama/llama3.3"
  }
}
```

## Docker Images

### Full Image (Recommended)

Includes VNC, noVNC, Chromium browser, and OpenClaw:

```bash
cd docker
docker build -f Dockerfile.full -t openclaw/agentbox:full .
```

**Size:** ~2.4GB  
**Includes:** Node.js 22, OpenClaw, TigerVNC, noVNC, Chromium, Xfce4 terminal

### Minimal Image

OpenClaw only, no VNC:

```bash
docker build -f Dockerfile.minimal -t openclaw/agentbox:minimal .
```

**Size:** ~750MB

## Development

```bash
# Install dependencies
pnpm install

# Build TypeScript
pnpm build

# Watch mode
pnpm dev

# Start dashboard (development)
cd dashboard && pnpm dev

# Lint
pnpm lint
```

### Project Structure

```
agentbox-openclaw/
├── src/
│   ├── index.ts           # Package exports
│   ├── provider.ts        # AgentBox provider implementation
│   ├── cli.ts             # CLI commands
│   ├── onboarding.ts      # Onboarding wizard logic
│   └── dashboard/
│       └── server.ts      # Express + WebSocket server
├── dashboard/             # Next.js frontend
│   ├── app/
│   │   ├── page.tsx       # Main dashboard UI
│   │   ├── layout.tsx     # Root layout
│   │   └── globals.css    # Tailwind styles
│   └── next.config.js     # Next.js config with API proxy
├── docker/
│   ├── Dockerfile.full    # Full image with VNC
│   ├── Dockerfile.minimal # Minimal image
│   ├── entrypoint.sh      # Container entrypoint
│   ├── supervisor/        # Process manager config
│   └── vnc/               # VNC startup scripts
├── dist/                  # Compiled output
└── start.sh               # Quick start script
```

## Troubleshooting

### Dashboard not loading

```bash
# Check if services are running
curl http://localhost:3456/health
curl http://localhost:3457/health

# Restart services
./start.sh
```

### VNC not connecting

```bash
# Check container is running
docker ps | grep agentbox

# Check VNC is running inside container
docker exec <container> ps aux | grep vnc

# Check noVNC port
curl http://localhost:<novnc-port>/
```

### Container keeps restarting

```bash
# Check logs
docker logs <container-name>

# Common issues:
# - Invalid OpenClaw config (check auth section)
# - Port already in use
```

## State Storage

Agent state is persisted at `~/.agentbox/openclaw/boxes.json`

## License

MIT

## Related

- [OpenClaw](https://github.com/openclaw/openclaw) — The AI agent framework
- [AgentBox](https://github.com/madarco/agentbox) — Sandboxed agent environments
- [noVNC](https://github.com/novnc/noVNC) — HTML5 VNC client
