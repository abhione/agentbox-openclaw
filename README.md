# 🦞 Box Claws

> **"Zoom for AI Agents"** — Deploy, monitor, and watch OpenClaw agents work in real-time.

<p align="center">
  <img src="https://img.shields.io/badge/OpenClaw-Agent%20Observatory-14A800?style=for-the-badge" alt="Box Claws">
  <img src="https://img.shields.io/badge/Docker-Supported-2496ED?style=for-the-badge" alt="Docker">
  <img src="https://img.shields.io/badge/E2B-Cloud%20VMs-000000?style=for-the-badge" alt="E2B">
  <img src="https://img.shields.io/badge/shadcn%2Fui-Components-000000?style=for-the-badge" alt="shadcn/ui">
</p>

## What is Box Claws?

Box Claws lets you deploy AI agents into isolated environments and **watch them work** through VNC screen sharing. Each agent gets their own desktop, browser, and workspace — you can observe their screen just like a Zoom call.

### 🎯 Use Cases

- **Sales Dev Reps** — Watch agents research prospects and draft outreach
- **Research Analysts** — See agents browse the web and compile reports  
- **Content Creators** — Observe agents writing and editing content
- **Browser Automation** — Debug agents interacting with web apps

## Features

| Feature | Docker (Local) | E2B (Cloud) |
|---------|----------------|-------------|
| Full desktop with VNC | ✅ | ✅ |
| Browser automation (Chromium + CDP) | ✅ | ✅ |
| OpenClaw gateway | ✅ | ✅ |
| Persistent storage | ✅ | ✅ |
| Isolated environments | Container | MicroVM |
| Cost | Free | $0.05/hr |
| Session limit | Unlimited | 24h (E2B Pro) |
| Checkpointing | ❌ | ✅ |

## Screenshots

### Dashboard Overview
The main dashboard shows all your deployed agents in a sidebar, with real-time status indicators and VNC streaming.

### 3-Step Deploy Wizard
1. **Choose Persona** — Pick from 8 pre-configured agent personas
2. **Configure** — Set name, infrastructure (Docker/E2B), model, and API key
3. **Channels** — Connect Telegram or other messaging channels

### Real-Time Deployment Progress
E2B deployments show live progress with stage indicators in the sidebar while the agent spins up.

## Quick Start

### 1. Install

```bash
# Clone the repo
git clone https://github.com/abhione/agentbox-openclaw.git
cd agentbox-openclaw

# Install dependencies
pnpm install

# Build
pnpm build

# Build Docker image (for local deployments)
pnpm docker:build
```

### 2. Configure

For **E2B Cloud** deployments, add your API key:

```bash
mkdir -p ~/.agentbox
echo "E2B_API_KEY=your_key_here" >> ~/.agentbox/secrets.env
```

Get an E2B API key at https://e2b.dev/dashboard

### 3. Run Dashboard

```bash
./start.sh
```

Open http://localhost:3456 to access the Box Claws dashboard.

### 4. Deploy Your First Agent

1. Click **"+ Deploy Agent"**
2. Choose a persona (Executive Assistant, Sales Dev Rep, etc.)
3. Name your agent
4. Select where to run: **Local Docker** or **E2B Cloud**
5. Add your Anthropic API key
6. (Optional) Connect a Telegram bot
7. Click **"Deploy"**

Watch your agent's desktop appear in the VNC viewer!

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Box Claws Dashboard                     │
│                    http://localhost:3456                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Agent 1   │  │   Agent 2   │  │   Agent 3   │   ...   │
│  │  (Docker)   │  │  (Docker)   │  │   (E2B)     │         │
│  │             │  │             │  │             │         │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │         │
│  │ │   VNC   │ │  │ │   VNC   │ │  │ │   VNC   │ │         │
│  │ │ Desktop │ │  │ │ Desktop │ │  │ │ Desktop │ │         │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │         │
│  │             │  │             │  │             │         │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │         │
│  │ │OpenClaw │ │  │ │OpenClaw │ │  │ │OpenClaw │ │         │
│  │ │ Gateway │ │  │ │ Gateway │ │  │ │ Gateway │ │         │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │         │
│  │             │  │             │  │             │         │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │         │
│  │ │Chromium │ │  │ │Chromium │ │  │ │Chromium │ │         │
│  │ │  (CDP)  │ │  │ │  (CDP)  │ │  │ │  (CDP)  │ │         │
│  │ └─────────┘ │  │ └─────────┘ │  │ └─────────┘ │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Agent Personas

Box Claws includes 8 pre-configured agent personas optimized for startup workflows:

| Persona | Icon | Best For | Default Model |
|---------|------|----------|---------------|
| Executive Assistant | 🤖 | Calendar, email, research | Claude Sonnet 4.6 |
| Sales Dev Rep | 🎯 | Outreach, prospecting | Claude Sonnet 4.6 |
| Customer Success | 🤝 | Onboarding, health monitoring | Claude Sonnet 4.6 |
| Content Creator | ✏️ | Blog, social, campaigns | Claude Sonnet 4.6 |
| Research Analyst | 🔍 | Market research, analysis | Claude Opus 4.6 |
| Technical Writer | 📄 | API docs, tutorials | Claude Sonnet 4.6 |
| Recruiter | 👥 | Sourcing, screening | Claude Sonnet 4.6 |
| Ops Automator | ⚙️ | Workflows, integrations | Claude Sonnet 4.6 |

Each persona comes with suggested agent names and optimized default settings.

## UI Components

The dashboard is built with modern React components using the [shadcn/ui](https://ui.shadcn.com) component library:

### Core Components
- **Button** — Primary actions, destructive variants, icon buttons
- **Card** — Agent summaries, deployment info
- **Badge** — Agent count, status indicators
- **Dialog** — 3-step deployment wizard modal
- **Input** — Form fields with labels
- **Select** — Model selection, infrastructure picker
- **Label** — Accessible form labels
- **Progress** — Deployment progress tracking

### Features
- **Sonner Toasts** — Success/error notifications in bottom-right
- **Lucide Icons** — Clean iconography throughout
- **Emerald Theme** — Primary color using oklch color space
- **Pulse Animations** — Running agent status indicators
- **Dark Mode** — Full dark theme optimized for monitoring

### Design Tokens (CSS Variables)

```css
--color-primary: oklch(0.696 0.17 162.48);     /* Emerald green */
--color-background: oklch(0.145 0 0);           /* Near black */
--color-card: oklch(0.17 0 0);                  /* Dark card bg */
--color-muted-foreground: oklch(0.708 0 0);     /* Subtle text */
--color-destructive: oklch(0.396 0.141 25.723); /* Red actions */
```

## API

The dashboard exposes a REST API on port 3457:

### Endpoints

```bash
# List providers
GET /api/providers

# List all agents
GET /api/boxes

# Create agent (Docker - instant)
POST /api/boxes
Content-Type: application/json
{
  "name": "my-agent",
  "provider": "docker",
  "persona": "sales-dev-rep",
  "anthropicApiKey": "sk-ant-...",
  "model": "anthropic/claude-sonnet-4-6",
  "telegramToken": "optional",
  "telegramUserId": "optional"
}

# Create agent (E2B - streaming progress)
GET /api/boxes/deploy-stream?name=my-agent&provider=e2b&anthropicApiKey=...
# Returns Server-Sent Events with progress updates

# Get agent details
GET /api/boxes/:id

# Start/stop agent
POST /api/boxes/:id/start
POST /api/boxes/:id/stop

# Delete agent
DELETE /api/boxes/:id

# Get VNC endpoint
GET /api/boxes/:id/vnc
```

### WebSocket Events

Connect to `ws://localhost:3457` to receive real-time updates:

```json
// Initial state
{ "type": "init", "boxes": [...] }

// Agent events
{ "type": "box:created", "box": {...} }
{ "type": "box:started", "boxId": "..." }
{ "type": "box:stopped", "boxId": "..." }
{ "type": "box:destroyed", "boxId": "..." }
```

## Development

```bash
# Watch mode for backend
pnpm dev

# Run dashboard in dev mode
cd dashboard && pnpm dev

# Dashboard will be at http://localhost:3456
# API server at http://localhost:3457
```

### Project Structure

```
agentbox-openclaw/
├── dashboard/                 # Next.js dashboard app
│   ├── app/
│   │   ├── globals.css       # Tailwind + CSS variables
│   │   ├── layout.tsx        # Root layout
│   │   └── page.tsx          # Main dashboard page
│   ├── components/
│   │   └── ui/               # shadcn/ui components
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── input.tsx
│   │       ├── label.tsx
│   │       ├── progress.tsx
│   │       ├── select.tsx
│   │       └── sonner.tsx
│   ├── lib/
│   │   └── utils.ts          # cn() utility
│   └── components.json       # shadcn/ui config
├── src/
│   ├── dashboard/
│   │   └── server.ts         # Express API + WebSocket server
│   ├── providers/
│   │   ├── docker.ts         # Docker provider
│   │   └── e2b.ts            # E2B cloud provider
│   └── index.ts              # CLI entry point
├── Dockerfile                # Agent container image
├── start.sh                  # Quick start script
└── README.md                 # This file
```

### Adding shadcn/ui Components

```bash
cd dashboard
pnpm dlx shadcn@latest add <component>
```

## Design System

Box Claws uses an emerald-themed dark mode design:

- **Primary Green:** `oklch(0.696 0.17 162.48)` (Emerald 500)
- **Background:** `oklch(0.145 0 0)` (Near black)
- **Cards:** `oklch(0.17 0 0)` with `oklch(0.269 0 0)` borders
- **Typography:** System fonts with OpenType features
- **Icons:** Lucide React icons

### Status Indicators

| State | Color | Animation |
|-------|-------|-----------|
| Running | Emerald | Pulse ring |
| Deploying | Yellow | Pulse + spinner |
| Stopped | Zinc | None |
| Missing | Red | None |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `E2B_API_KEY` | E2B cloud API key | - |
| `PORT` | Dashboard port | 3456 |
| `API_PORT` | API server port | 3457 |
| `NEXT_PUBLIC_API_URL` | API URL for frontend | http://localhost:3457 |

## Troubleshooting

### Docker agents not starting
```bash
# Make sure Docker is running
docker info

# Check if the image exists
docker images | grep agentbox-openclaw

# Rebuild if needed
pnpm docker:build
```

### E2B deployment stuck
- Check your API key is valid
- E2B has a 24h session limit (Pro extends this)
- Watch the console for error messages

### VNC not loading
- Verify the agent is in "running" state
- Try opening the noVNC URL directly: `http://localhost:<novnc-port>/vnc.html?autoconnect=true`
- Check if noVNC is running inside the container

## License

MIT

---

Built with ❤️ for AI agent operators.
