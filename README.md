# 🦞 Box Claws

> **"Zoom for AI Agents"** — Deploy, monitor, and watch OpenClaw agents work in real-time.

<p align="center">
  <img src="https://img.shields.io/badge/OpenClaw-Agent%20Observatory-14A800?style=for-the-badge" alt="Box Claws">
  <img src="https://img.shields.io/badge/Docker-Supported-2496ED?style=for-the-badge" alt="Docker">
  <img src="https://img.shields.io/badge/E2B-Cloud%20VMs-000000?style=for-the-badge" alt="E2B">
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

| Persona | Emoji | Best For |
|---------|-------|----------|
| Executive Assistant | 👔 | Calendar, email, research |
| Sales Dev Rep | 🎯 | Outreach, prospecting |
| Customer Success | 🤝 | Onboarding, health monitoring |
| Content Creator | ✍️ | Blog, social, campaigns |
| Research Analyst | 🔬 | Market research, analysis |
| Technical Writer | 📚 | API docs, tutorials |
| Recruiter | 🔍 | Sourcing, screening |
| Ops Automator | ⚙️ | Workflows, integrations |

## API

The dashboard exposes a REST API on port 3457:

```bash
# List providers
curl http://localhost:3457/api/providers

# List agents
curl http://localhost:3457/api/boxes

# Create agent
curl -X POST http://localhost:3457/api/boxes \
  -H "Content-Type: application/json" \
  -d '{"name": "my-agent", "provider": "docker", "anthropicApiKey": "..."}'

# Get VNC endpoint
curl http://localhost:3457/api/boxes/my-agent/vnc
```

## Development

```bash
# Watch mode
pnpm dev

# Run dashboard in dev
cd dashboard && pnpm dev
```

## Design System

Box Claws uses an Upwork-inspired dark mode design:

- **Primary Green:** `#14A800` (Upwork green)
- **Background:** `#0a0a0a`
- **Cards:** `#141414` with `#262626` borders
- **Typography:** Inter / System fonts

## License

MIT

---

Built with ❤️ for AI agent operators.
