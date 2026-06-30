# @openclaw/agentbox

> **"Zoom for Agents"** — Run OpenClaw/Hermes agents in isolated containers with live VNC screen sharing.

[![npm version](https://img.shields.io/npm/v/@openclaw/agentbox)](https://www.npmjs.com/package/@openclaw/agentbox)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Deploy AI agents in Docker containers with one command. Watch them work in real-time through VNC. Manage multiple agents from a unified dashboard.

## Features

- 🐳 **Docker Isolation** — Each agent runs in its own container
- 📺 **VNC Screen Sharing** — See exactly what your agents see via noVNC web client
- 🎛️ **Agent Observatory Dashboard** — Web UI for managing all your agents
- 🔌 **AgentBox Compatible** — Works as a provider for the [AgentBox](https://agent-box.sh) ecosystem
- 🔑 **Credential Management** — Secure injection of API keys and tokens
- 📡 **Real-time Activity** — WebSocket streams for agent activity monitoring

## Quick Start

```bash
# Install globally
npm install -g @openclaw/agentbox

# Deploy an agent
claw-box deploy --name my-agent --telegram-token $BOT_TOKEN

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
import { openclawProvider } from '@openclaw/agentbox';

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

Start the dashboard server:

```typescript
import { DashboardServer } from '@openclaw/agentbox';

const server = new DashboardServer({ port: 3456 });
await server.start();
```

**REST Endpoints:**

- `GET /api/boxes` — List all boxes
- `POST /api/boxes` — Create new box
- `GET /api/boxes/:id` — Get box details
- `POST /api/boxes/:id/start` — Start box
- `POST /api/boxes/:id/stop` — Stop box
- `DELETE /api/boxes/:id` — Destroy box
- `POST /api/boxes/:id/exec` — Execute command
- `GET /api/boxes/:id/vnc` — Get VNC URL

**WebSocket (ws://localhost:3456):**

```javascript
ws.send(JSON.stringify({ type: 'subscribe', boxId: 'my-agent' }));
// Receive: { type: 'activity', boxId, data, timestamp }
```

## Docker Images

```bash
# Build full image with VNC
docker build -f docker/Dockerfile.full -t openclaw/agentbox:full docker/

# Build minimal image (no VNC)
docker build -f docker/Dockerfile.minimal -t openclaw/agentbox:minimal docker/
```

## Port Allocation

Each agent box uses 4 ports (starting at 19000):

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

## AgentBox Integration

This package can be used as a provider for [AgentBox](https://github.com/madarco/agentbox):

```typescript
import { openclawProvider } from '@openclaw/agentbox';

// Register as a custom provider
// (Integration with AgentBox's provider system coming soon)
```

## Requirements

- Docker (Docker Desktop or compatible)
- Node.js 20+
- OpenClaw 2026.5.0+

## License

MIT © Abhi

---

Built with ⚡ by OpenClaw
