import express, { type Express, type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server } from 'http';
import { 
  getProvider, 
  listProviders, 
  isProviderAvailable,
  type BoxRecord,
  type BoxWithState,
  type ProviderName,
} from '../providers/index.js';
import { generateSoulMd } from '../config-generator.js';
import { startVncProxy, publicVncUrl } from './vnc-proxy.js';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const STATE_DIR = path.join(os.homedir(), '.agentbox', 'openclaw');
const STATE_FILE = path.join(STATE_DIR, 'boxes.json');

export interface DashboardServerOptions {
  port?: number;
}

interface BoxesState {
  boxes: BoxRecord[];
}

export class DashboardServer {
  private app: Express;
  private server: Server;
  private wss: WebSocketServer;
  private vncProxy: Server | null = null;
  private port: number;
  private clients: Set<WebSocket> = new Set();
  private subscriptions: Map<WebSocket, string> = new Map();

  constructor(options: DashboardServerOptions = {}) {
    this.port = options.port || 3457;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    fs.mkdirSync(STATE_DIR, { recursive: true });
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private loadState(): BoxesState {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch {
      return { boxes: [] };
    }
  }

  private saveState(state: BoxesState): void {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    
    // CORS for dashboard frontend
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // Serve static Next.js build if available
    const outDir = path.join(process.cwd(), 'dashboard', 'out');
    if (fs.existsSync(outDir)) {
      this.app.use(express.static(outDir));
    }
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok', version: '0.2.0' });
    });

    // List available providers
    this.app.get('/api/providers', (req: Request, res: Response) => {
      const providers = listProviders().map(name => ({
        name,
        available: isProviderAvailable(name),
        description: name === 'docker' ? 'Local Docker containers' : 'E2B Cloud Desktop VMs',
      }));
      res.json(providers);
    });

    // List boxes with state
    this.app.get('/api/boxes', async (req: Request, res: Response) => {
      try {
        const state = this.loadState();
        
        // Enrich with current state from providers
        const enriched: BoxWithState[] = await Promise.all(
          state.boxes.map(async (box) => {
            try {
              const provider = getProvider(box.provider);
              const runtimeState = await provider.probeState(box);
              return { ...box, state: runtimeState, vncUrl: publicVncUrl(box) };
            } catch {
              return { ...box, state: 'missing' as const, vncUrl: publicVncUrl(box) };
            }
          })
        );
        
        res.json(enriched);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get box
    this.app.get('/api/boxes/:id', async (req: Request, res: Response) => {
      try {
        const state = this.loadState();
        const box = state.boxes.find(b => b.id === req.params.id || b.name.toLowerCase() === req.params.id.toLowerCase());
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        
        const provider = getProvider(box.provider);
        const runtimeState = await provider.probeState(box);
        const endpoints = await provider.getEndpoints(box);
        
        res.json({ ...box, state: runtimeState, endpoints, vncUrl: publicVncUrl(box) });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Create box
    this.app.post('/api/boxes', async (req: Request, res: Response) => {
      try {
        const { 
          name, 
          provider: providerName = 'docker',
          workspacePath, 
          persona,
          model,
          anthropicApiKey,
          telegramToken,
          telegramUserId,
          agentFiles,
          onboardingAnswers,
        } = req.body;

        if (!name) {
          res.status(400).json({ error: 'Name is required' });
          return;
        }

        if (!anthropicApiKey) {
          res.status(400).json({ error: 'Anthropic API key is required' });
          return;
        }

        const provider = getProvider(providerName as ProviderName);

        this.broadcast({ type: 'log', boxId: name, data: `Creating ${name} on ${providerName}...` });

        const record = await provider.create({
          name,
          workspacePath: workspacePath || process.cwd(),
          config: {
            name,
            model: model || 'anthropic/claude-sonnet-4-6',
            persona,
            channels: telegramToken ? {
              telegram: { 
                botToken: telegramToken,
                allowedUserIds: telegramUserId ? [telegramUserId] : undefined,
              },
            } : undefined,
          },
          anthropicApiKey,
          telegramUserId,
          agentFiles,
          onboardingAnswers,
          onLog: (line) => this.broadcast({ type: 'log', boxId: name, data: line }),
        });

        // Save to state
        const state = this.loadState();
        state.boxes.push(record);
        this.saveState(state);

        this.broadcast({ type: 'box:created', box: record });
        res.json({ ...record, vncUrl: publicVncUrl(record) });
      } catch (error) {
        console.error('Create box error:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Start box
    this.app.post('/api/boxes/:id/start', async (req: Request, res: Response) => {
      try {
        const state = this.loadState();
        const box = state.boxes.find(b => b.id === req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        
        const provider = getProvider(box.provider);
        await provider.start(box);
        
        this.broadcast({ type: 'box:started', boxId: req.params.id });
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Stop box
    this.app.post('/api/boxes/:id/stop', async (req: Request, res: Response) => {
      try {
        const state = this.loadState();
        const box = state.boxes.find(b => b.id === req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        
        const provider = getProvider(box.provider);
        await provider.stop(box);
        
        this.broadcast({ type: 'box:stopped', boxId: req.params.id });
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Destroy box
    this.app.delete('/api/boxes/:id', async (req: Request, res: Response) => {
      try {
        const state = this.loadState();
        const boxIndex = state.boxes.findIndex(b => b.id === req.params.id);
        if (boxIndex === -1) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        
        const box = state.boxes[boxIndex];
        const provider = getProvider(box.provider);
        await provider.destroy(box);
        
        // Remove from state
        state.boxes.splice(boxIndex, 1);
        this.saveState(state);
        
        this.broadcast({ type: 'box:destroyed', boxId: req.params.id });
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Execute command in box
    this.app.post('/api/boxes/:id/exec', async (req: Request, res: Response) => {
      try {
        const state = this.loadState();
        const box = state.boxes.find(b => b.id === req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        
        const { command } = req.body;
        const provider = getProvider(box.provider);
        const result = await provider.exec(box, Array.isArray(command) ? command : [command]);
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get VNC/endpoints info
    this.app.get('/api/boxes/:id/vnc', async (req: Request, res: Response) => {
      try {
        const state = this.loadState();
        const box = state.boxes.find(b => b.id === req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        
        const provider = getProvider(box.provider);
        const endpoints = await provider.getEndpoints(box);
        
        res.json({
          provider: box.provider,
          ...endpoints,
          vncUrl: publicVncUrl(box),
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // SSE endpoint for streaming deploy progress (E2B)
    this.app.get('/api/boxes/deploy-stream', async (req: Request, res: Response) => {
      const { 
        name, 
        provider: providerName = 'docker',
        persona,
        model,
        anthropicApiKey,
        telegramToken,
        telegramUserId,
      } = req.query as Record<string, string>;

      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const sendProgress = (stage: string, message: string, percent: number) => {
        res.write(`data: ${JSON.stringify({ stage, message, percent })}\n\n`);
      };

      const sendError = (error: string) => {
        res.write(`data: ${JSON.stringify({ error })}\n\n`);
        res.end();
      };

      const sendDone = () => {
        res.write(`data: ${JSON.stringify({ done: true, stage: 'done', message: 'Agent deployed!', percent: 100 })}\n\n`);
        res.end();
      };

      try {
        if (!name) {
          sendError('Name is required');
          return;
        }

        if (!anthropicApiKey) {
          sendError('Anthropic API key is required');
          return;
        }

        const provider = getProvider(providerName as ProviderName);

        sendProgress('init', 'Creating sandbox...', 5);

        const record = await provider.create({
          name,
          workspacePath: process.cwd(),
          config: {
            name,
            model: model || 'anthropic/claude-sonnet-4-6',
            persona,
            channels: telegramToken ? {
              telegram: { 
                botToken: telegramToken,
                allowedUserIds: telegramUserId ? [telegramUserId] : undefined,
              },
            } : undefined,
          },
          anthropicApiKey,
          telegramUserId,
          onLog: (line) => {
            // Parse log messages to determine progress stage
            let stage = 'init';
            let percent = 10;
            
            if (line.includes('Upgrading Node') || line.includes('Node.js')) {
              stage = 'node';
              percent = 20;
            } else if (line.includes('Installing OpenClaw') || line.includes('npm install')) {
              stage = 'install';
              percent = 40;
            } else if (line.includes('OpenClaw installed') || line.includes('installed')) {
              stage = 'install';
              percent = 70;
            } else if (line.includes('Writing config') || line.includes('config')) {
              stage = 'config';
              percent = 80;
            } else if (line.includes('Starting') || line.includes('gateway')) {
              stage = 'gateway';
              percent = 90;
            } else if (line.includes('ready') || line.includes('Ready')) {
              stage = 'gateway';
              percent = 95;
            }
            
            sendProgress(stage, line, percent);
            this.broadcast({ type: 'log', boxId: name, data: line });
          },
        });

        // Save to state
        const state = this.loadState();
        state.boxes.push(record);
        this.saveState(state);

        this.broadcast({ type: 'box:created', box: record });
        sendDone();
      } catch (error) {
        console.error('Deploy stream error:', error);
        sendError(String(error));
      }
    });

    // Checkpoint (E2B only)
    this.app.post('/api/boxes/:id/checkpoint', async (req: Request, res: Response) => {
      try {
        const state = this.loadState();
        const box = state.boxes.find(b => b.id === req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        
        const provider = getProvider(box.provider);
        if (!('checkpoint' in provider)) {
          res.status(400).json({ error: 'Provider does not support checkpoints' });
          return;
        }
        
        const { name } = req.body;
        const snapshotId = await (provider as any).checkpoint(box, name || `checkpoint-${Date.now()}`);
        
        res.json({ snapshotId });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', async (ws: WebSocket) => {
      this.clients.add(ws);

      // Send initial state
      const state = this.loadState();
      ws.send(JSON.stringify({ type: 'init', boxes: state.boxes }));

      ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribe' && msg.boxId) {
            this.subscriptions.set(ws, msg.boxId);
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        this.subscriptions.delete(ws);
      });
    });
  }

  private broadcast(message: any): void {
    const json = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  }

  async start(): Promise<void> {
    // Optional public VNC proxy (hosted deployments, e.g. Fly.io).
    // Only started when a token is configured; the API itself stays private.
    const vncToken = process.env.VNC_PROXY_TOKEN;
    if (vncToken) {
      this.vncProxy = startVncProxy({
        token: vncToken,
        port: parseInt(process.env.VNC_PROXY_PORT || '8080', 10),
      });
    }

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`🚀 Agent Observatory API running on http://localhost:${this.port}`);
        console.log(`   Dashboard: http://localhost:3456`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    this.wss.close();
    this.server.close();
    this.vncProxy?.close();
  }
}
