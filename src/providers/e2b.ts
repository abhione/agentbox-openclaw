/**
 * E2B Desktop provider for OpenClaw Agent Observatory
 * Runs agents in E2B cloud microVMs with full GUI/VNC
 */

import type {
  OpenClawProvider,
  BoxRecord,
  BoxRuntimeState,
  BoxEndpoints,
  CreateBoxRequest,
} from './types.js';
import { generateOpenClawConfig, generateSoulMd } from '../config-generator.js';

// E2B SDK types (we'll import dynamically to avoid bundling issues)
interface E2BSandbox {
  sandboxId: string;
  getHost(port: number): string;
  filesystem: {
    write(path: string, content: string): Promise<void>;
    makeDir(path: string): Promise<void>;
  };
  commands: {
    run(command: string, opts?: { timeout?: number; background?: boolean }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  };
  keepAlive(ms: number): Promise<void>;
  kill(): Promise<void>;
}

interface E2BDesktopSandbox extends E2BSandbox {
  getVncUrl(): Promise<string>;
  stream: {
    start(): Promise<void>;
    getUrl(): string;
  };
}

export class E2BProvider implements OpenClawProvider {
  readonly name = 'e2b' as const;
  private apiKey: string;
  private Sandbox: any;
  private Desktop: any;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.E2B_API_KEY || '';
    if (!this.apiKey) {
      console.warn('E2B_API_KEY not set - E2B provider will not work');
    }
  }

  private async loadSDK(): Promise<void> {
    if (this.Sandbox) return;
    
    try {
      // Dynamic import to avoid bundling issues
      const e2b = await import('e2b');
      this.Sandbox = e2b.Sandbox;
      
      // Try to load desktop extension (exports Sandbox with desktop capabilities)
      try {
        const desktop = await import('@e2b/desktop');
        this.Desktop = desktop.Sandbox; // Desktop SDK's Sandbox has VNC support
      } catch {
        console.warn('E2B Desktop SDK not installed, using base Sandbox');
      }
    } catch (err) {
      throw new Error(`Failed to load E2B SDK: ${err}`);
    }
  }

  async create(req: CreateBoxRequest): Promise<BoxRecord> {
    await this.loadSDK();
    
    if (!this.apiKey) {
      throw new Error('E2B_API_KEY not configured. Get one at https://e2b.dev/dashboard');
    }

    req.onLog?.(`Creating E2B Desktop sandbox for "${req.name}"...`);

    // Use Desktop sandbox for GUI support, fall back to base Sandbox
    const SandboxClass = this.Desktop || this.Sandbox;
    
    // E2B Desktop template with Ubuntu + XFCE + noVNC
    const templateId = this.Desktop ? 'desktop' : 'base';
    
    const sandbox: E2BDesktopSandbox = await SandboxClass.create(templateId, {
      apiKey: this.apiKey,
      timeoutMs: 60000,
      metadata: {
        name: req.name,
        provider: 'openclaw-observatory',
      },
    });

    req.onLog?.(`Sandbox ${sandbox.sandboxId} created, installing OpenClaw...`);

    // Generate OpenClaw config (E2B uses internal ports)
    const ports = {
      gateway: 18789,
      browserControl: 18791,
      vnc: 5901,
      novnc: 6080,
    };
    
    const openclawConfig = generateOpenClawConfig(
      req.config,
      ports,
      req.anthropicApiKey,
      req.telegramUserId
    );

    // Install OpenClaw and dependencies
    await this.setupOpenClaw(sandbox, openclawConfig, req);

    // Generate VNC password for this session
    const vncPassword = this.generateVncPassword();

    // Get VNC URL
    let vncUrl = '';
    if (this.Desktop && 'getVncUrl' in sandbox) {
      vncUrl = await (sandbox as E2BDesktopSandbox).getVncUrl();
    }

    const record: BoxRecord = {
      id: `e2b-${req.name.toLowerCase()}-${Date.now()}`,
      name: req.name,
      provider: 'e2b',
      sandboxId: sandbox.sandboxId,
      createdAt: new Date().toISOString(),
      workspacePath: '/home/user/workspace',
      ports,
      config: req.config,
      vncPassword,
    };

    req.onLog?.('OpenClaw gateway starting...');

    // Keep sandbox alive for 24 hours (E2B Pro limit)
    await sandbox.keepAlive(24 * 60 * 60 * 1000);

    return record;
  }

  private async setupOpenClaw(
    sandbox: E2BSandbox,
    config: any,
    req: CreateBoxRequest
  ): Promise<void> {
    // Create directories
    await sandbox.commands.run('mkdir -p /home/user/.openclaw /home/user/workspace');

    // Write OpenClaw config
    await sandbox.filesystem.write(
      '/home/user/.openclaw/openclaw.json',
      JSON.stringify(config, null, 2)
    );

    // Write SOUL.md
    const soulMd = generateSoulMd(req.config);
    await sandbox.filesystem.write('/home/user/workspace/SOUL.md', soulMd);

    // Install OpenClaw (use npm since it's more reliable in E2B)
    req.onLog?.('Installing OpenClaw...');
    const installResult = await sandbox.commands.run(
      'npm install -g openclaw@latest',
      { timeout: 120000 }
    );
    
    if (installResult.exitCode !== 0) {
      throw new Error(`Failed to install OpenClaw: ${installResult.stderr}`);
    }

    // Install Chromium for browser automation
    req.onLog?.('Installing Chromium...');
    await sandbox.commands.run(
      'apt-get update && apt-get install -y chromium-browser',
      { timeout: 180000 }
    );

    // Start Chromium with CDP
    req.onLog?.('Starting Chromium...');
    await sandbox.commands.run(
      'chromium-browser --remote-debugging-port=18800 --no-sandbox --disable-gpu --disable-dev-shm-usage &',
      { background: true }
    );

    // Start OpenClaw gateway
    req.onLog?.('Starting OpenClaw gateway...');
    await sandbox.commands.run(
      'cd /home/user/workspace && openclaw gateway run --bind 0.0.0.0 &',
      { background: true }
    );

    // Wait for gateway to be ready
    for (let i = 0; i < 30; i++) {
      const check = await sandbox.commands.run('curl -s http://localhost:18789/health || true');
      if (check.stdout.includes('ok')) {
        return;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  private generateVncPassword(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  async start(box: BoxRecord): Promise<void> {
    // E2B sandboxes auto-start, but we can resume a paused one
    await this.loadSDK();
    if (!box.sandboxId) throw new Error('No sandbox ID');
    
    // Reconnect to existing sandbox
    const sandbox = await this.Sandbox.connect(box.sandboxId, { apiKey: this.apiKey });
    
    // Restart OpenClaw if needed
    await sandbox.commands.run(
      'pgrep -f "openclaw gateway" || (cd /home/user/workspace && openclaw gateway run --bind 0.0.0.0 &)',
      { background: true }
    );
  }

  async stop(box: BoxRecord): Promise<void> {
    await this.loadSDK();
    if (!box.sandboxId) throw new Error('No sandbox ID');
    
    const sandbox = await this.Sandbox.connect(box.sandboxId, { apiKey: this.apiKey });
    await sandbox.commands.run('pkill -f "openclaw gateway" || true');
  }

  async destroy(box: BoxRecord): Promise<void> {
    await this.loadSDK();
    if (!box.sandboxId) throw new Error('No sandbox ID');
    
    try {
      const sandbox = await this.Sandbox.connect(box.sandboxId, { apiKey: this.apiKey });
      await sandbox.kill();
    } catch {
      // Sandbox may already be gone
    }
  }

  async probeState(box: BoxRecord): Promise<BoxRuntimeState> {
    await this.loadSDK();
    if (!box.sandboxId) return 'missing';
    
    try {
      const sandbox = await this.Sandbox.connect(box.sandboxId, { apiKey: this.apiKey });
      // Check if OpenClaw is running
      const result = await sandbox.commands.run('pgrep -f "openclaw gateway" || echo "not running"');
      return result.stdout.includes('not running') ? 'stopped' : 'running';
    } catch {
      return 'missing';
    }
  }

  async getEndpoints(box: BoxRecord): Promise<BoxEndpoints> {
    await this.loadSDK();
    if (!box.sandboxId) return {};

    try {
      const sandbox = await this.Sandbox.connect(box.sandboxId, { apiKey: this.apiKey });
      
      // E2B provides public URLs for ports
      const gatewayHost = sandbox.getHost(18789);
      const novncHost = sandbox.getHost(6080);
      
      return {
        gateway: `https://${gatewayHost}`,
        novnc: `https://${novncHost}/vnc.html?autoconnect=true&password=${box.vncPassword || ''}`,
      };
    } catch {
      return {};
    }
  }

  async exec(box: BoxRecord, command: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    await this.loadSDK();
    if (!box.sandboxId) throw new Error('No sandbox ID');
    
    const sandbox = await this.Sandbox.connect(box.sandboxId, { apiKey: this.apiKey });
    return sandbox.commands.run(command.join(' '));
  }

  // E2B supports pause/resume via snapshots
  async pause(box: BoxRecord): Promise<void> {
    // E2B auto-pauses after timeout, no explicit pause needed
  }

  async resume(box: BoxRecord): Promise<void> {
    await this.start(box);
  }

  async checkpoint(box: BoxRecord, name: string): Promise<string> {
    await this.loadSDK();
    if (!box.sandboxId) throw new Error('No sandbox ID');
    
    const sandbox = await this.Sandbox.connect(box.sandboxId, { apiKey: this.apiKey });
    const snapshot = await sandbox.createSnapshot({ name });
    return snapshot.snapshotId;
  }
}
