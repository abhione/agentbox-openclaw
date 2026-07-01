# AgentBox Teleport: Extending to Non-Code Workloads

## What is Teleport?

Teleport is upstream AgentBox's (madarco/agentbox) mechanism for moving an entire working context — project files, agent session, settings, and conversation history — from the host machine into an isolated container or cloud VM.

### Current Teleport Channels (upstream v0.20.0)

| Channel | What Gets Moved | Mechanism |
|---------|----------------|-----------|
| Workspace (code) | Git repo, uncommitted changes, untracked files | `git worktree add` + stash + tar |
| Agent volumes | Claude/Codex settings, skills, session state | rsync via Docker volume |
| Carry paths | User-declared files in `agentbox.yaml` | tar pipe: host → container |
| Credentials | API keys, auth tokens | Separate tarball |
| Env vars | Agent-specific forwarded keys | Direct env injection |

**Key insight: Everything except the git worktree is workload-agnostic.** The tar-pipe + named-volume + carry-path architecture doesn't care what's in the files.

## Extension: Browser State Teleport

### What to teleport
- **Chrome user-data dir** — cookies, localStorage, IndexedDB, extensions (~50MB without caches)
- **Open tab set** — captured via CDP `Target.getTargets()` before teardown
- **Proxy/auth config** — if browser uses specific proxy or MITM certs

### Implementation (fits existing carry: pattern)
```yaml
# agentbox.yaml
carry:
  - src: ~/.agentbox/browser-profiles/linkedin-sourcer
    dest: /home/agent/.config/chromium
    exclude: [Cache, Code Cache, GPUCache, ShaderCache, "Service Worker/CacheStorage"]
```

### Tab capture/restore hooks
```bash
# Pre-destroy: capture open tabs via CDP
curl -s http://localhost:9222/json | jq '.[].url' > /tmp/browser-tabs.json

# Post-start: restore
chromium $(cat /tmp/browser-tabs.json | tr '\n' ' ')
```

## Extension: Document Workspace Teleport

For non-developer workloads (data analysis, document processing, research):

### Carry paths (works today, zero code change)
```yaml
carry:
  - src: ~/Documents/analysis-project
    dest: /workspace/documents
  - src: ~/.chroma/collections/research
    dest: /workspace/vector-store
```

### New volume type: "data volume"
Persistent named volume (`agentbox-data-shared`) that survives box destruction. For shared datasets between fleet agents.

## Extension: Browser Fleet

Spin up N parallel browser agents, each with its own profile and identity:

```bash
for i in 1 2 3 4 5; do
  agentbox claude -i "Task for agent $i" \
    --name "browser-$i" --with-playwright -d
done
agentbox dashboard  # Watch all 5 working
```

### What upstream AgentBox has today
- ✅ Every box gets Chrome + VNC (built-in)
- ✅ Parallel box creation via `-i` flag + queue
- ✅ `--with-playwright` flag
- ✅ Dashboard with live VNC
- ✅ Checkpoints for <1s restore

### What doesn't exist (build in this repo)
- ❌ Chrome profile library (pre-baked login sessions)
- ❌ Browser-state teleport (carry user-data dirs)
- ❌ Fleet command (deploy N boxes from one manifest)
- ❌ Shared output volume across fleet
- ❌ Workload templates (coding vs. browser vs. research)
