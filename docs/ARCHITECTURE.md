# AgentBox-OpenClaw Architecture

## What This Is

**Agent Observatory** — a deployment and monitoring platform for AI agents running in Docker containers with real-time VNC screen sharing. Think "Zoom for AI Agents."

## Current Capabilities (v0.2.0)

### Core
- Docker container lifecycle (create/start/stop/pause/resume/destroy)
- OpenClaw agent configuration generation
- Real-time VNC screen sharing via noVNC
- Chrome browser with CDP (Chrome DevTools Protocol) per container
- Web dashboard with WebSocket activity feed
- CLI (`claw-box`) for all operations
- E2B cloud provider support

### Per-Container Stack
```
┌─────────────────────────────┐
│         Container           │
│  ┌───────────┐              │
│  │  OpenClaw │ ← AI Agent   │
│  │  Gateway  │   (port 18789)│
│  └───────────┘              │
│  ┌───────────┐              │
│  │ Chromium  │ ← Browser    │
│  │  + CDP    │   (port 18800)│
│  └───────────┘              │
│  ┌───────────┐              │
│  │ TigerVNC  │ ← Display    │
│  │  + noVNC  │   (port 6080) │
│  └───────────┘              │
│  ┌───────────┐              │
│  │  Openbox  │ ← Window Mgr │
│  │  + xterm  │              │
│  └───────────┘              │
└─────────────────────────────┘
```

### Port Allocation
Each agent gets a block of 10 ports starting at 19000:
- `base+0`: Gateway (OpenClaw API)
- `base+1`: Browser Control (CDP)
- `base+2`: VNC server
- `base+3`: noVNC web viewer

### Providers
- **Docker** (local) — primary, production-ready
- **E2B** (cloud) — sandbox VMs with VNC, checkpoint support

### Personas (8 built-in templates)
- Executive Assistant
- Sales Development Rep
- Customer Success
- Content Creator
- Research Analyst
- Technical Writer
- **Recruiter**
- Ops Automator

### Dashboard API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/boxes` | List all agents |
| POST | `/api/boxes` | Create new agent |
| POST | `/api/boxes/:id/start` | Start agent |
| POST | `/api/boxes/:id/stop` | Stop agent |
| DELETE | `/api/boxes/:id` | Destroy agent |
| POST | `/api/boxes/:id/exec` | Execute command |
| GET | `/api/boxes/:id/vnc` | VNC connection info |

### CLI Commands
```
claw-box deploy [config]    # Deploy from YAML or flags
claw-box list               # List all boxes
claw-box status <name>      # Detailed status
claw-box start/stop <name>  # Lifecycle
claw-box destroy <name>     # Remove
claw-box logs <name>        # Stream logs
claw-box exec <name> <cmd>  # Run command
claw-box vnc <name>         # Open VNC viewer
claw-box shell <name>       # Interactive shell
claw-box dashboard          # Start web UI
claw-box message <name>     # Send message to agent
```

## Source Structure

```
agentbox-openclaw/
├── src/
│   ├── index.ts              # Package exports
│   ├── provider.ts           # Legacy Docker provider (559 lines)
│   ├── cli.ts                # CLI commands (361 lines)
│   ├── config-generator.ts   # OpenClaw config builders (372 lines)
│   ├── onboarding.ts         # Deploy wizard questions (176 lines)
│   ├── personas.ts           # 8 persona templates (432 lines)
│   ├── providers/
│   │   ├── types.ts          # Provider interface (83 lines)
│   │   ├── docker.ts         # Refactored Docker provider (239 lines)
│   │   ├── e2b.ts            # E2B cloud provider (302 lines)
│   │   └── index.ts          # Provider registry (48 lines)
│   └── dashboard/
│       └── server.ts         # Express + WebSocket server (385 lines)
├── dashboard/                # Next.js frontend
├── docker/
│   ├── Dockerfile.full       # Full image: Node + OpenClaw + Chrome + VNC
│   ├── Dockerfile.minimal    # Minimal: OpenClaw only
│   ├── Dockerfile.openclaw   # OpenClaw-specific
│   ├── entrypoint.sh         # Service startup script
│   ├── supervisor/           # supervisord configs
│   └── vnc/                  # VNC startup scripts
└── docs/                     # Documentation
```
