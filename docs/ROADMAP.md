# Roadmap: AI Digital Employee Fleet

## Vision

One-button deployment of a team of AI employees — each with a real Microsoft 365 identity (email, calendar, Teams presence), a browser logged into company tools, and an AI agent brain. A manager agent onboards them, assigns work, and reports back to a human.

## Key Discovery: OpenClaw Already Has the Channel Layer

The following OpenClaw plugins/channels provide Teams + Email + M365 integration out of the box:

### Official (Bundled)
- **`@openclaw/msteams`** — Microsoft Teams channel. DM, group chat, channels, file sharing, Adaptive Cards. Supports client secret, certificate, Azure Managed Identity auth. Docs: https://docs.openclaw.ai/channels/msteams

### Community (ClawHub — install via `openclaw plugins install`)
| Plugin | Downloads | What It Does |
|--------|-----------|--------------|
| `@byungkyu/outlook` | 23.1K | Outlook email read/send/manage via Graph API |
| `@byungkyu/microsoft-teams` | 2K | Full Teams Graph API (teams, channels, meetings, transcripts) |
| `@robert-janssen/microsoft-365` | 1.7K | Outlook + Calendar + Contacts + OneDrive |
| `@byungkyu/microsoft-onedrive` | 7.1K | OneDrive files via Graph API |
| `@byungkyu/microsoft-sharepoint` | 867 | SharePoint via Graph API |
| `@porteden/email` | 8.7K | Multi-account Gmail + Outlook |
| `@abhinavjp/ms-outlook-teams-assistant` | 3K | Track and nag about email + Teams messages |

**This means we don't build a Teams bridge. We configure OpenClaw's existing channel.**

## What We Build (the novel layer)

### Phase 1: Teams Channel Config (1 day)
Extend `src/config-generator.ts` to generate `@openclaw/msteams` channel config alongside existing Telegram support. Extend `src/onboarding.ts` wizard with Teams/M365 questions.

### Phase 2: Identity Provisioning — `src/identity.ts` (3 days)
Automated Azure AD + M365 provisioning per agent:
1. Create Azure AD user account (e.g., `sam@prosourceit.ai`)
2. Assign M365 Business Basic license ($6/mo — mailbox, calendar, OneDrive, Teams)
3. Set profile photo
4. Create Azure AD app registration (for Graph API)
5. Create Azure Bot resource + enable Teams channel
6. Generate & upload Teams app manifest to org catalog
7. Store credentials in container secret store

**Cost: ~$6/month per digital employee for full M365 identity.**

### Phase 3: Pre-Install Plugins in Docker Image (0.5 day)
Extend `docker/Dockerfile.full` to pre-install OpenClaw plugins:
```dockerfile
RUN openclaw plugins install @openclaw/msteams \
    @byungkyu/outlook \
    @byungkyu/microsoft-teams \
    @robert-janssen/microsoft-365
```

### Phase 4: Browser Profile Management — `src/browser-profiles.ts` (1 day)
Save and load Chrome user-data directories for persistent SaaS logins:
- `claw-fleet profile create <name>` — start box with VNC, human logs in
- `claw-fleet profile save <name>` — snapshot Chrome user-data (strip caches)
- Carry profile into container on startup via Docker volume mount
- Profiles stored at `~/.agentbox/browser-profiles/<name>/`

### Phase 5: Fleet Manifest + Orchestrator — `src/fleet.ts` (3 days)
Team manifest YAML that defines N agents + orchestrator:
```yaml
name: prosource-recruiting
shared:
  volume: prosource-data
orchestrator:
  name: manager
  agent: hermes
  channels: { teams: true }
employees:
  - name: sourcer
    agent: openclaw
    browser: { profile: linkedin-sourcer }
    channels: { teams: true, email: true }
  - name: recruiter
    agent: openclaw
    browser: { profile: linkedin-recruiter }
    channels: { teams: true, email: true }
```

New CLI: `claw-fleet deploy/status/onboard/pause/resume/destroy/scale`

### Phase 6: Inter-Agent Communication (2 days)
Shared filesystem inbox pattern via Docker named volume:
```
/shared/
  taskboard.json
  inbox/{agent}/        # Manager drops assignments
  outbox/{agent}/       # Agent delivers results
  context/              # Shared knowledge
```
MCP tools: `check_inbox()`, `submit_work()`, `read_context()`, `update_task()`

### Phase 7: Manager Onboarding Conversation (1 day)
After fleet deploy, manager messages human on Teams:
> "Team is online. I have Sam (Sourcer), Ravi (Recruiter), and Dana (Sales) ready. What are we working on?"

Human briefs the manager → manager decomposes → assigns to employees → monitors → reports.

## Timeline
| Phase | Effort | Cumulative |
|-------|--------|------------|
| 1. Teams channel config | 1 day | 1 day |
| 2. Identity provisioning | 3 days | 4 days |
| 3. Plugin pre-install | 0.5 day | 4.5 days |
| 4. Browser profiles | 1 day | 5.5 days |
| 5. Fleet manifest + CLI | 3 days | 8.5 days |
| 6. Inter-agent comms | 2 days | 10.5 days |
| 7. Manager onboarding | 1 day | 11.5 days |

**MVP shortcut (~6 days):** Skip Phase 2 (manually create M365 accounts), do Phases 1, 3, 4, 5, 6.

## Upstream AgentBox Comparison

| Feature | madarco/agentbox | This repo (planned) |
|---------|-----------------|---------------------|
| AI coding agents (Claude/Codex) | ✅ Core feature | ❌ Not focused |
| VNC per box | ✅ Built-in | ✅ Built-in |
| Browser per box | ✅ Built-in | ✅ Built-in |
| Git workspace teleport | ✅ Advanced | ❌ Not needed |
| Teams/Email integration | ❌ None | ✅ Via OpenClaw plugins |
| M365 identity provisioning | ❌ None | ✅ Planned |
| Browser profile management | ❌ None | ✅ Planned |
| Fleet orchestration | ❌ Queue only | ✅ Team manifest |
| Inter-agent communication | ❌ None | ✅ Shared volume + MCP |
| Enterprise tool onboarding | ❌ None | ✅ SSO + manual VNC |

## Use Cases

### Staffing Agency (Primary)
Recruiter + Sourcer + Sales + Manager — each with LinkedIn, CRM, and email access.

### Consulting Team
Researcher + Analyst + Writer — each browsing different data sources, shared output volume.

### Customer Success
Account Manager + Support Agent + QA — each monitoring different dashboards and tools.

### Sales Team
SDR + AE + Sales Ops — each working CRM, LinkedIn, email sequences.
