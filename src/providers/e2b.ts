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
  files: {
    write(path: string, content: string | ArrayBuffer): Promise<{ path: string }>;
    makeDir(path: string): Promise<boolean>;
  };
  commands: {
    run(command: string, opts?: { timeoutMs?: number; background?: boolean }): Promise<{ exitCode: number; stdout: string; stderr: string }>;
  };
  keepAlive(timeoutMs: number): Promise<void>;
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

    // Use base Sandbox (Desktop requires separate package)
    req.onLog?.('Creating E2B sandbox...');
    
    const sandbox: E2BDesktopSandbox = await this.Sandbox.create({
      apiKey: this.apiKey,
      timeoutMs: 300000,
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
    // E2B base sandbox has Node.js v20 but OpenClaw needs v22+
    req.onLog?.('Upgrading Node.js to v22...');
    
    // Install n (Node version manager)
    req.onLog?.('Running: npm install -g n');
    let r = await sandbox.commands.run('npm install -g n 2>&1', { timeoutMs: 60000 });
    req.onLog?.(`npm install -g n: exit=${r.exitCode}`);
    if (r.exitCode !== 0) {
      req.onLog?.(`stdout: ${r.stdout}`);
      req.onLog?.(`stderr: ${r.stderr}`);
      throw new Error(`Failed to install n: ${r.stderr || r.stdout}`);
    }
    
    // Install Node 22
    r = await sandbox.commands.run('n 22 2>&1', { timeoutMs: 120000 });
    if (r.exitCode !== 0) {
      throw new Error(`Failed to install Node 22: ${r.stderr || r.stdout}`);
    }
    
    // Verify Node version
    const nodeCheck = await sandbox.commands.run('/usr/local/bin/node --version');
    req.onLog?.(`Node.js: ${nodeCheck.stdout.trim()}`);
    
    // Create directories
    await sandbox.commands.run('mkdir -p /home/user/.openclaw /home/user/workspace');

    // Write OpenClaw config
    req.onLog?.('Writing config...');
    await sandbox.files.write(
      '/home/user/.openclaw/openclaw.json',
      JSON.stringify(config, null, 2)
    );

    // Write SOUL.md
    const soulMd = generateSoulMd(req.config);
    await sandbox.files.write('/home/user/workspace/SOUL.md', soulMd);

    // Install OpenClaw globally with new Node (can take 3-5 minutes)
    req.onLog?.('Installing OpenClaw (this takes 3-5 minutes)...');
    const installResult = await sandbox.commands.run(
      '/usr/local/bin/npm install -g openclaw@latest 2>&1',
      { timeoutMs: 600000 }  // 10 minute timeout
    );
    
    if (installResult.exitCode !== 0) {
      req.onLog?.(`Install failed: ${installResult.stderr || installResult.stdout}`);
      throw new Error(`Failed to install OpenClaw: ${installResult.stderr || installResult.stdout}`);
    }
    req.onLog?.('OpenClaw installed!');

    // Start OpenClaw gateway in background using new Node
    req.onLog?.('Starting OpenClaw gateway...');
    await sandbox.commands.run(
      'cd /home/user/workspace && HOME=/home/user nohup /usr/local/bin/node /usr/local/bin/openclaw gateway run  > /tmp/openclaw.log 2>&1 &'
    );

    // Wait for gateway to be ready
    req.onLog?.('Waiting for gateway...');
    for (let i = 0; i < 60; i++) {
      const check = await sandbox.commands.run('curl -s http://localhost:18789/health 2>/dev/null || echo "not ready"');
      if (check.stdout.includes('ok')) {
        req.onLog?.('Gateway ready!');
        return;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    // Check logs if gateway didn't start
    const logs = await sandbox.commands.run('cat /tmp/openclaw.log 2>/dev/null | tail -20');
    req.onLog?.(`Gateway logs: ${logs.stdout}`);
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
      'pgrep -f "openclaw gateway" || (cd /home/user/workspace && openclaw gateway run  &)',
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
