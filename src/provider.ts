/**
 * OpenClaw Provider for AgentBox
 * 
 * Implements the AgentBox Provider interface to run OpenClaw agents
 * in isolated Docker containers with VNC screen sharing.
 */

import Docker from 'dockerode';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Types matching AgentBox's provider interface
export type BoxRuntimeState = 'running' | 'paused' | 'stopped' | 'missing';
export type ProviderName = 'docker' | 'daytona' | 'hetzner' | 'openclaw' | (string & {});
export type AttachKind = 'shell' | 'agent' | 'logs';

export interface BoxRecord {
  id: string;
  name: string;
  provider?: ProviderName;
  containerId?: string;
  createdAt: string;
  workspacePath?: string;
  ports?: {
    gateway?: number;
    vnc?: number;
    novnc?: number;
    browserControl?: number;
  };
  config?: OpenClawBoxConfig;
}

export interface BoxEndpoints {
  gateway?: string;
  vnc?: string;
  novnc?: string;
  web?: string;
}

export interface OpenClawBoxConfig {
  name: string;
  model?: string;
  channels?: {
    telegram?: { botToken: string };
    discord?: { botToken: string };
    slack?: { botToken: string; appToken: string };
  };
  credentials?: {
    bedrock?: { accessKeyId: string; secretAccessKey: string };
    openai?: { apiKey: string };
    anthropic?: { apiKey: string };
  };
  workspace?: string;
  memory?: boolean;
  vnc?: boolean;
}

export interface CreateBoxRequest {
  workspacePath: string;
  name?: string;
  projectRoot: string;
  image?: string;
  vnc?: { enabled: boolean };
  providerOptions?: {
    openclawConfig?: OpenClawBoxConfig;
    basePort?: number;
  };
  /** Full OpenClaw config JSON to inject into container */
  openclawConfig?: Record<string, unknown>;
  /** Credential files to inject (anthropic-key, etc.) */
  credentialFiles?: { [path: string]: string };
  /** Workspace files to inject (SOUL.md, MEMORY.md, etc.) */
  workspaceFiles?: { [path: string]: string };
  onLog?: (line: string) => void;
}

export interface CreatedBox {
  record: BoxRecord;
  imageBuilt?: boolean;
}

export interface InspectedBox {
  record: BoxRecord;
  state: BoxRuntimeState;
  endpoints: BoxEndpoints;
  raw?: unknown;
}

export interface ExecOptions {
  user?: string;
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface AttachSpec {
  argv: string[];
  env?: Record<string, string>;
  cleanup?: () => Promise<void>;
}

export interface BuildAttachOptions {
  sessionName?: string;
  user?: string;
  service?: string;
  tail?: number;
  follow?: boolean;
  command?: string;
  noTmux?: boolean;
  detached?: boolean;
}

// State management
interface BoxState {
  record: BoxRecord;
  container?: Docker.Container;
  activityBuffer: string[];
  events: EventEmitter;
}

const DEFAULT_IMAGE = 'openclaw/agentbox:full';
const BASE_PORT = 19000;
const PORT_INCREMENT = 10;

export class OpenClawProvider {
  readonly name: ProviderName = 'openclaw';
  private docker: Docker;
  private boxes: Map<string, BoxState> = new Map();
  private nextPort: number = BASE_PORT;
  private stateDir: string;

  constructor() {
    this.docker = new Docker();
    this.stateDir = path.join(os.homedir(), '.agentbox', 'openclaw');
    this.ensureStateDir();
    this.loadState();
  }

  private ensureStateDir(): void {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  private loadState(): void {
    const statePath = path.join(this.stateDir, 'boxes.json');
    if (fs.existsSync(statePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        for (const record of data.boxes || []) {
          this.boxes.set(record.id, {
            record,
            activityBuffer: [],
            events: new EventEmitter(),
          });
          if (record.ports?.gateway) {
            this.nextPort = Math.max(this.nextPort, record.ports.gateway + PORT_INCREMENT);
          }
        }
      } catch {
        // Start fresh
      }
    }
  }

  private saveState(): void {
    const statePath = path.join(this.stateDir, 'boxes.json');
    const data = {
      boxes: Array.from(this.boxes.values()).map(s => s.record),
    };
    fs.writeFileSync(statePath, JSON.stringify(data, null, 2));
  }

  private allocatePorts(): { gateway: number; vnc: number; novnc: number; browserControl: number } {
    const base = this.nextPort;
    this.nextPort += PORT_INCREMENT;
    return {
      gateway: base,
      browserControl: base + 1,
      vnc: base + 2,
      novnc: base + 3,
    };
  }

  // ---- Lifecycle ----

  async create(req: CreateBoxRequest): Promise<CreatedBox> {
    const name = req.name || `openclaw-${Date.now()}`;
    const id = `openclaw-${name}-${Date.now()}`;
    const ports = req.providerOptions?.basePort 
      ? { gateway: req.providerOptions.basePort, vnc: req.providerOptions.basePort + 2, novnc: req.providerOptions.basePort + 3, browserControl: req.providerOptions.basePort + 1 }
      : this.allocatePorts();
    
    const image = req.image || DEFAULT_IMAGE;
    const config = req.providerOptions?.openclawConfig;
    
    req.onLog?.(`Creating OpenClaw box "${name}" with ports ${JSON.stringify(ports)}`);

    // Build openclaw.json for the container
    const openclawConfig = this.buildOpenClawConfig(config, ports);

    // Create container
    const container = await this.docker.createContainer({
      name: `agentbox-${name}`,
      Image: image,
      ExposedPorts: {
        '18789/tcp': {},
        '18791/tcp': {},
        '5901/tcp': {},
        '6080/tcp': {},
      },
      HostConfig: {
        PortBindings: {
          '18789/tcp': [{ HostPort: String(ports.gateway) }],
          '18791/tcp': [{ HostPort: String(ports.browserControl) }],
          '5901/tcp': [{ HostPort: String(ports.vnc) }],
          '6080/tcp': [{ HostPort: String(ports.novnc) }],
        },
        Binds: req.workspacePath ? [`${req.workspacePath}:/workspace`] : [],
        RestartPolicy: { Name: 'unless-stopped' },
      },
      Env: [
        `OPENCLAW_CONFIG=${JSON.stringify(openclawConfig)}`,
        'DISPLAY=:1',
        'VNC_ENABLED=true',
      ],
      WorkingDir: '/workspace',
      Tty: true,
    });

    const record: BoxRecord = {
      id,
      name,
      provider: 'openclaw',
      containerId: container.id,
      createdAt: new Date().toISOString(),
      workspacePath: req.workspacePath,
      ports,
      config,
    };

    const state: BoxState = {
      record,
      container,
      activityBuffer: [],
      events: new EventEmitter(),
    };

    this.boxes.set(id, state);
    this.saveState();

    // Start the container
    await container.start();
    req.onLog?.(`Container started: ${container.id.slice(0, 12)}`);

    // Inject config - use provided openclawConfig if available, else build from options
    const configToInject = req.openclawConfig || openclawConfig;
    await this.injectConfig(container, configToInject);
    req.onLog?.(`OpenClaw configured...`);

    // Inject credential files (anthropic-key, etc.)
    if (req.credentialFiles) {
      await this.injectCredentialFiles(container, req.credentialFiles);
      req.onLog?.(`Credentials configured`);
    }

    // Inject workspace files (SOUL.md, MEMORY.md, etc.)
    if (req.workspaceFiles) {
      await this.injectWorkspaceFiles(container, req.workspaceFiles);
      req.onLog?.(`Workspace files created (SOUL.md, MEMORY.md, etc.)`);
    }

    req.onLog?.(`Agent starting...`);

    return { record, imageBuilt: false };
  }

  private buildOpenClawConfig(config?: OpenClawBoxConfig, ports?: BoxRecord['ports']): object {
    return {
      server: {
        port: 18789,
      },
      tools: {
        browser: {
          enabled: true,
          managedBrowser: {
            enabled: true,
            port: 18800,
          },
        },
      },
      models: {
        default: config?.model || 'anthropic/claude-sonnet-4-20250514',
      },
      channels: config?.channels || {},
      credentials: config?.credentials || {},
    };
  }

  private async injectConfig(container: Docker.Container, config: object): Promise<void> {
    const configJson = JSON.stringify(config, null, 2);
    // Use base64 to avoid shell escaping issues
    const configB64 = Buffer.from(configJson).toString('base64');
    const exec = await container.exec({
      Cmd: ['sh', '-c', `mkdir -p /home/agent/.openclaw && echo '${configB64}' | base64 -d > /home/agent/.openclaw/openclaw.json && chown -R agent:agent /home/agent/.openclaw`],
      User: 'root',
    });
    await exec.start({ Detach: false });
  }

  private async injectCredentialFiles(container: Docker.Container, files: { [path: string]: string }): Promise<void> {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = `/home/agent/.openclaw/${filePath}`;
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
      const contentB64 = Buffer.from(content).toString('base64');
      
      const exec = await container.exec({
        Cmd: ['sh', '-c', `mkdir -p ${dirPath} && echo '${contentB64}' | base64 -d > ${fullPath} && chmod 600 ${fullPath} && chown agent:agent ${fullPath}`],
        User: 'root',
      });
      await exec.start({ Detach: false });
    }
  }

  private async injectWorkspaceFiles(container: Docker.Container, files: { [path: string]: string }): Promise<void> {
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = `/home/agent/workspace/${filePath}`;
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
      const contentB64 = Buffer.from(content).toString('base64');
      
      const exec = await container.exec({
        Cmd: ['sh', '-c', `mkdir -p ${dirPath} && echo '${contentB64}' | base64 -d > ${fullPath} && chown agent:agent ${fullPath}`],
        User: 'root',
      });
      await exec.start({ Detach: false });
    }
  }

  async start(box: BoxRecord): Promise<BoxRecord> {
    const state = this.boxes.get(box.id);
    if (!state) throw new Error(`Box ${box.id} not found`);

    const container = state.container || this.docker.getContainer(box.containerId!);
    await container.start();
    state.container = container;

    return box;
  }

  async reconnect(box: BoxRecord): Promise<BoxRecord> {
    // For Docker, reconnect is the same as ensuring container is running
    return this.start(box);
  }

  async pause(box: BoxRecord): Promise<void> {
    const container = this.docker.getContainer(box.containerId!);
    await container.pause();
  }

  async resume(box: BoxRecord): Promise<void> {
    const container = this.docker.getContainer(box.containerId!);
    await container.unpause();
  }

  async stop(box: BoxRecord): Promise<void> {
    const container = this.docker.getContainer(box.containerId!);
    await container.stop();
  }

  async destroy(box: BoxRecord): Promise<void> {
    try {
      const container = this.docker.getContainer(box.containerId!);
      await container.stop().catch(() => {});
      await container.remove({ force: true });
    } catch {
      // Container may already be removed
    }
    this.boxes.delete(box.id);
    this.saveState();
  }

  // ---- Query ----

  async inspect(box: BoxRecord): Promise<InspectedBox> {
    const container = this.docker.getContainer(box.containerId!);
    const info = await container.inspect();
    
    const state: BoxRuntimeState = info.State.Running 
      ? 'running' 
      : info.State.Paused 
        ? 'paused' 
        : 'stopped';

    const endpoints: BoxEndpoints = {
      gateway: `http://localhost:${box.ports?.gateway}`,
      vnc: `vnc://localhost:${box.ports?.vnc}`,
      novnc: `http://localhost:${box.ports?.novnc}`,
      web: `http://localhost:${box.ports?.novnc}`,
    };

    return { record: box, state, endpoints, raw: info };
  }

  async probeState(box: BoxRecord): Promise<BoxRuntimeState> {
    try {
      const container = this.docker.getContainer(box.containerId!);
      const info = await container.inspect();
      if (info.State.Running) return 'running';
      if (info.State.Paused) return 'paused';
      return 'stopped';
    } catch {
      return 'missing';
    }
  }

  // ---- Exec ----

  async exec(box: BoxRecord, argv: string[], opts?: ExecOptions): Promise<ExecResult> {
    const container = this.docker.getContainer(box.containerId!);
    const exec = await container.exec({
      Cmd: argv,
      User: opts?.user || 'agent',
      WorkingDir: opts?.cwd || '/workspace',
      Env: opts?.env ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`) : undefined,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Detach: false });
    
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      
      stream.on('data', (chunk: Buffer) => {
        // Docker multiplexes stdout/stderr
        const header = chunk.slice(0, 8);
        const streamType = header[0]; // 1 = stdout, 2 = stderr
        const payload = chunk.slice(8).toString();
        if (streamType === 1) stdout += payload;
        else stderr += payload;
      });

      stream.on('end', async () => {
        const inspection = await exec.inspect();
        resolve({
          exitCode: inspection.ExitCode ?? 0,
          stdout,
          stderr,
        });
      });
    });
  }

  // ---- URL ----

  async resolveUrl(box: BoxRecord, opts?: { kind?: 'web' | 'vnc' }): Promise<string> {
    const kind = opts?.kind || 'web';
    if (kind === 'vnc') {
      return `http://localhost:${box.ports?.novnc}`;
    }
    return `http://localhost:${box.ports?.gateway}`;
  }

  // ---- Attach ----

  async buildAttach(box: BoxRecord, kind: AttachKind, opts?: BuildAttachOptions): Promise<AttachSpec> {
    const containerId = box.containerId!;

    if (kind === 'logs') {
      return {
        argv: ['docker', 'logs', '-f', '--tail', String(opts?.tail || 100), containerId],
      };
    }

    if (kind === 'shell') {
      return {
        argv: ['docker', 'exec', '-it', '-u', opts?.user || 'agent', containerId, 'bash', '-l'],
      };
    }

    // agent - attach to openclaw gateway
    if (opts?.noTmux) {
      return {
        argv: ['docker', 'exec', '-it', '-u', 'agent', containerId, 'openclaw', 'gateway', 'attach'],
      };
    }

    const sessionName = opts?.sessionName || 'openclaw';
    const cmd = opts?.command || 'openclaw gateway run';
    
    return {
      argv: [
        'docker', 'exec', '-it', '-u', 'agent', containerId,
        'tmux', 'new-session', '-A', '-s', sessionName, cmd,
      ],
    };
  }

  // ---- List all boxes ----

  list(): BoxRecord[] {
    return Array.from(this.boxes.values()).map(s => s.record);
  }

  get(id: string): BoxRecord | undefined {
    return this.boxes.get(id)?.record;
  }

  getByName(name: string): BoxRecord | undefined {
    for (const state of this.boxes.values()) {
      if (state.record.name === name) return state.record;
    }
    return undefined;
  }

  // ---- Activity stream ----

  subscribeActivity(boxId: string, callback: (event: { type: string; data: unknown }) => void): () => void {
    const state = this.boxes.get(boxId);
    if (!state) throw new Error(`Box ${boxId} not found`);

    const handler = (event: { type: string; data: unknown }) => callback(event);
    state.events.on('activity', handler);
    
    return () => state.events.off('activity', handler);
  }

  emitActivity(boxId: string, type: string, data: unknown): void {
    const state = this.boxes.get(boxId);
    if (state) {
      const event = { type, data, timestamp: new Date().toISOString() };
      state.activityBuffer.push(JSON.stringify(event));
      if (state.activityBuffer.length > 1000) state.activityBuffer.shift();
      state.events.emit('activity', event);
    }
  }
}

// Singleton export
export const openclawProvider = new OpenClawProvider();
export default openclawProvider;
