/**
 * Docker provider for OpenClaw Agent Observatory
 * Runs agents in local Docker containers with VNC
 */

import Docker from 'dockerode';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type {
  OpenClawProvider,
  BoxRecord,
  BoxRuntimeState,
  BoxEndpoints,
  CreateBoxRequest,
  PortAllocation,
} from './types.js';
import { generateOpenClawConfig, generateSoulMd } from '../config-generator.js';

const DEFAULT_IMAGE = 'openclaw/agentbox:full';
const STATE_DIR = path.join(os.homedir(), '.agentbox', 'openclaw');

export class DockerProvider implements OpenClawProvider {
  readonly name = 'docker' as const;
  private docker: Docker;
  private stateDir: string;

  constructor() {
    this.docker = new Docker();
    this.stateDir = STATE_DIR;
    fs.mkdirSync(this.stateDir, { recursive: true });
  }

  private allocatePorts(): PortAllocation {
    // Read existing boxes to find next available port range
    const stateFile = path.join(this.stateDir, 'boxes.json');
    let maxPort = 19000;
    
    try {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
      for (const box of data.boxes || []) {
        if (box.ports?.gateway && box.ports.gateway >= maxPort) {
          maxPort = box.ports.gateway + 10;
        }
      }
    } catch {
      // No state file yet
    }

    return {
      gateway: maxPort,
      browserControl: maxPort + 1,
      vnc: maxPort + 2,
      novnc: maxPort + 3,
    };
  }

  async create(req: CreateBoxRequest): Promise<BoxRecord> {
    const ports = this.allocatePorts();
    const containerName = `agentbox-${req.name.toLowerCase()}`;
    
    req.onLog?.(`Creating OpenClaw box "${req.name}" with ports ${JSON.stringify(ports)}`);

    // Ensure agent state directory exists for persistent storage
    const agentStateDir = path.join(this.stateDir, 'agents', req.name.toLowerCase());
    await fsPromises.mkdir(agentStateDir, { recursive: true });

    // Generate config
    const openclawConfig = generateOpenClawConfig(req.config, ports, req.anthropicApiKey, req.telegramUserId);
    
    // Write config to agent state dir
    const configPath = path.join(agentStateDir, 'openclaw.json');
    await fsPromises.writeFile(configPath, JSON.stringify(openclawConfig, null, 2));

    // Generate SOUL.md
    const soulMd = generateSoulMd(req.config);
    const soulPath = path.join(agentStateDir, 'workspace', 'SOUL.md');
    await fsPromises.mkdir(path.dirname(soulPath), { recursive: true });
    await fsPromises.writeFile(soulPath, soulMd);

    req.onLog?.('Pulling/checking image...');
    
    // Create container
    const container = await this.docker.createContainer({
      name: containerName,
      Image: DEFAULT_IMAGE,
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
        Binds: [
          ...(req.workspacePath ? [`${req.workspacePath}:/workspace`] : []),
          `${agentStateDir}:/home/agent/.openclaw`,
        ],
        RestartPolicy: { Name: 'unless-stopped' },
      },
      Env: [
        'DISPLAY=:1',
        'VNC_ENABLED=true',
      ],
    });

    req.onLog?.('Starting container...');
    await container.start();

    const record: BoxRecord = {
      id: `openclaw-${req.name.toLowerCase()}-${Date.now()}`,
      name: req.name,
      provider: 'docker',
      containerId: container.id,
      createdAt: new Date().toISOString(),
      workspacePath: req.workspacePath,
      ports,
      config: req.config,
    };

    req.onLog?.('Container started, waiting for gateway...');
    
    // Wait for gateway to be ready
    await this.waitForGateway(ports.gateway, 30000);
    
    req.onLog?.('OpenClaw gateway ready!');

    return record;
  }

  private async waitForGateway(port: number, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        if (res.ok) return;
      } catch {
        // Not ready yet
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    // Don't throw - gateway might just need more time
  }

  async start(box: BoxRecord): Promise<void> {
    if (!box.containerId) throw new Error('No container ID');
    const container = this.docker.getContainer(box.containerId);
    await container.start();
  }

  async stop(box: BoxRecord): Promise<void> {
    if (!box.containerId) throw new Error('No container ID');
    const container = this.docker.getContainer(box.containerId);
    await container.stop();
  }

  async destroy(box: BoxRecord): Promise<void> {
    if (!box.containerId) throw new Error('No container ID');
    const container = this.docker.getContainer(box.containerId);
    try {
      await container.stop();
    } catch {
      // Already stopped
    }
    await container.remove();
  }

  async probeState(box: BoxRecord): Promise<BoxRuntimeState> {
    if (!box.containerId) return 'missing';
    try {
      const container = this.docker.getContainer(box.containerId);
      const info = await container.inspect();
      if (info.State.Running) return 'running';
      if (info.State.Paused) return 'paused';
      return 'stopped';
    } catch {
      return 'missing';
    }
  }

  async getEndpoints(box: BoxRecord): Promise<BoxEndpoints> {
    if (!box.ports) return {};
    return {
      gateway: `http://127.0.0.1:${box.ports.gateway}`,
      vnc: `vnc://127.0.0.1:${box.ports.vnc}`,
      novnc: `http://127.0.0.1:${box.ports.novnc}/vnc.html?autoconnect=true`,
    };
  }

  async exec(box: BoxRecord, command: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    if (!box.containerId) throw new Error('No container ID');
    const container = this.docker.getContainer(box.containerId);
    
    const exec = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ Tty: false });
    
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      
      stream.on('data', (chunk: Buffer) => {
        // Docker multiplexes stdout/stderr
        stdout += chunk.toString();
      });
      
      stream.on('end', async () => {
        const info = await exec.inspect();
        resolve({
          exitCode: info.ExitCode ?? 0,
          stdout,
          stderr,
        });
      });
    });
  }

  async pause(box: BoxRecord): Promise<void> {
    if (!box.containerId) throw new Error('No container ID');
    const container = this.docker.getContainer(box.containerId);
    await container.pause();
  }

  async resume(box: BoxRecord): Promise<void> {
    if (!box.containerId) throw new Error('No container ID');
    const container = this.docker.getContainer(box.containerId);
    await container.unpause();
  }
}
