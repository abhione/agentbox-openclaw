# @openclaw/agentbox

> **"Zoom for Agents"** — Run OpenClaw/Hermes agents in isolated containers with live VNC screen sharing.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Deploy AI agents in Docker containers with one command. Watch them work in real-time through VNC. Manage multiple agents from a unified dashboard.

![Agent Observatory Dashboard](https://github.com/abhione/agentbox-openclaw/raw/main/docs/dashboard-preview.png)

## Features

- 🐳 **Docker Isolation** — Each agent runs in its own container
- 📺 **VNC Screen Sharing** — See exactly what your agents see via noVNC web client
- 🎛️ **Agent Observatory Dashboard** — Beautiful web UI for managing all your agents
- 🔌 **AgentBox Compatible** — Works as a provider for the [AgentBox](https://agent-box.sh) ecosystem
- 🔑 **Credential Management** — Secure injection of API keys and tokens
- 📡 **Real-time Activity** — WebSocket streams for agent activity monitoring
- ⚡ **One-Click Deploy** — Spawn new agents from the dashboard in seconds

## Quick Start

```bash
# Clone and install
git clone https://github.com/abhione/agentbox-openclaw.git
cd agentbox-openclaw
pnpm install
pnpm build

# Link the CLI globally
npm link

# Build the Docker images
pnpm docker:build          # Full image with VNC (2.4GB)
# or
pnpm docker:build:minimal  # Minimal image (746MB)

# Deploy an agent
claw-box deploy --name my-agent

# Open the screen sharing
claw-box vnc my-agent

# Or start the full dashboard
claw-box dashboard
```

## CLI Commands

```bash
claw-box deploy [config.yaml]  # Deploy a new agent
claw-box list                   # List all agent boxes
claw-box status <name>          # Show agent status
claw-box start <name>           # Start a stopped agent
claw-box stop <name>            # Stop a running agent
claw-box destroy <name>         # Remove an agent completely

claw-box vnc <name>             # Open VNC screen sharing in browser
claw-box shell <name>           # Interactive shell in container
claw-box logs <name>            # Stream agent logs
claw-box exec <name> <cmd>      # Execute command in agent

claw-box dashboard              # Start the Agent Observatory web UI
```

## Agent Observatory Dashboard

The dashboard provides a beautiful web interface for managing your agents:

- **Agent List** — See all agents with real-time status indicators
- **VNC Viewer** — Embedded screen sharing right in the browser
- **Activity Feed** — Live stream of agent activity
- **One-Click Deploy** — Create new agents without touching the CLI
- **WebSocket Updates** — Everything updates in real-time

### Starting the Dashboard

```bash
# Via CLI
claw-box dashboard

# Or programmatically
node -e "
import('./dist/index.js').then(m => {
  new m.DashboardServer({ port: 3456 }).start();
});
"

# Opens at http://localhost:3456
```

## Configuration File

Create `agent.yaml`:

```yaml
name: sales-agent
model: anthropic/claude-sonnet-4-20250514

channels:
  telegram:
    botToken: "YOUR_BOT_TOKEN"

credentials:
  anthropic:
    apiKey: "YOUR_API_KEY"
  # Or use AWS Bedrock
  bedrock:
    accessKeyId: "..."
    secretAccessKey: "..."

workspace: /path/to/workspace
memory: true
vnc: true
```

Then deploy:

```bash
claw-box deploy agent.yaml
```

## Programmatic Usage

```typescript
import { openclawProvider, DashboardServer } from '@openclaw/agentbox';

// Create a new agent box
const result = await openclawProvider.create({
  name: 'my-agent',
  workspacePath: '/path/to/workspace',
  projectRoot: '/path/to/workspace',
  vnc: { enabled: true },
  providerOptions: {
    openclawConfig: {
      name: 'my-agent',
      model: 'anthropic/claude-sonnet-4-20250514',
      channels: {
        telegram: { botToken: process.env.BOT_TOKEN }
      }
    }
  }
});

console.log(`VNC: http://localhost:${result.record.ports.novnc}`);

// Start the dashboard
const server = new DashboardServer({ port: 3456 });
await server.start();

// List all boxes
const boxes = openclawProvider.list();

// Inspect a box
const info = await openclawProvider.inspect(box);

// Execute command
const result = await openclawProvider.exec(box, ['openclaw', 'status']);

// Destroy when done
await openclawProvider.destroy(box);
```

## Dashboard API

**REST Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/boxes` | List all boxes |
| POST | `/api/boxes` | Create new box |
| GET | `/api/boxes/:id` | Get box details |
| POST | `/api/boxes/:id/start` | Start box |
| POST | `/api/boxes/:id/stop` | Stop box |
| DELETE | `/api/boxes/:id` | Destroy box |
| POST | `/api/boxes/:id/exec` | Execute command |
| GET | `/api/boxes/:id/vnc` | Get VNC URL |

**WebSocket (ws://localhost:3456):**

```javascript
const ws = new WebSocket('ws://localhost:3456');

// Subscribe to agent activity
ws.send(JSON.stringify({ type: 'subscribe', boxId: 'my-agent' }));

// Receive events
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  // { type: 'init', boxes: [...] }
  // { type: 'box:created', box: {...} }
  // { type: 'activity', boxId, data, timestamp }
};
```

## Docker Images

```bash
# Build full image with VNC (recommended)
docker build -f docker/Dockerfile.full -t openclaw/agentbox:full docker/

# Build minimal image (no VNC)
docker build -f docker/Dockerfile.minimal -t openclaw/agentbox:minimal docker/
```

### Image Contents

**Full Image (2.4GB):**
- Node.js 22
- OpenClaw CLI
- TigerVNC + noVNC
- Chromium (via Playwright)
- Supervisor for process management
- Openbox window manager

**Minimal Image (746MB):**
- Node.js 22
- OpenClaw CLI
- Git, curl

## Port Allocation

Each agent box uses 4 ports (starting at 19000 by default):

| Port Offset | Service | Description |
|-------------|---------|-------------|
| +0 | Gateway | OpenClaw gateway (18789 internal) |
| +1 | Browser Control | Browser automation (18791 internal) |
| +2 | VNC | VNC server (5901 internal) |
| +3 | noVNC | Web-based VNC (6080 internal) |

Example: Agent deployed at base port 19000:
- Gateway: http://localhost:19000
- Browser: http://localhost:19001  
- VNC: vnc://localhost:19002
- noVNC: http://localhost:19003

## Project Structure

```
agentbox-openclaw/
├── src/
│   ├── index.ts          # Package exports
│   ├── provider.ts       # OpenClaw provider (AgentBox compatible)
│   ├── cli.ts            # claw-box CLI
│   └── dashboard/
│       └── server.ts     # Dashboard REST + WebSocket server
├── dashboard/
│   └── app/
│       ├── page.tsx      # React dashboard UI
│       ├── layout.tsx    # App layout
│       └── globals.css   # Tailwind styles
├── docker/
│   ├── Dockerfile.full   # Full image with VNC
│   ├── Dockerfile.minimal # Minimal image
│   ├── entrypoint.sh     # Container entrypoint
│   ├── supervisor/       # Process management config
│   └── vnc/              # VNC session setup
└── dist/                 # Built output
```

## Requirements

- Docker (Docker Desktop or compatible)
- Node.js 20+
- pnpm

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Watch mode
pnpm dev

# Link CLI for local testing
npm link
```

## License

MIT © Abhi

---

Built with ⚡ by the OpenClaw team
