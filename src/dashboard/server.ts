import express, { type Express, type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server } from 'http';
import { openclawProvider, type BoxRecord } from '../provider.js';
import { generateOpenClawConfig, generateWorkspaceFiles } from '../config-generator.js';
import * as path from 'path';
import * as fs from 'fs';

export interface DashboardServerOptions {
  port?: number;
}

export class DashboardServer {
  private app: Express;
  private server: Server;
  private wss: WebSocketServer;
  private port: number;
  private clients: Set<WebSocket> = new Set();
  private subscriptions: Map<WebSocket, string> = new Map();

  constructor(options: DashboardServerOptions = {}) {
    this.port = options.port || 3456;
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
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
      res.json({ status: 'ok', version: '0.1.0' });
    });

    // List boxes
    this.app.get('/api/boxes', async (req: Request, res: Response) => {
      try {
        const boxes = await openclawProvider.list();
        res.json(boxes);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get box
    this.app.get('/api/boxes/:id', async (req: Request, res: Response) => {
      try {
        const box = await openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        res.json(box);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Create box with full onboarding
    this.app.post('/api/boxes', async (req: Request, res: Response) => {
      try {
        const { 
          name, 
          workspacePath, 
          config, 
          image,
          persona,
          credentials,
          model,
          telegramToken,
        } = req.body;

        // Generate proper OpenClaw config
        const openclawConfig = generateOpenClawConfig({
          agentName: config?.name || name,
          model: model || 'anthropic/claude-sonnet-4-20250514',
          provider: credentials?.provider || 'anthropic',
          credentials: credentials || {},
          telegramToken,
          personaId: persona,
        });

        // Generate workspace files
        const workspaceFiles = generateWorkspaceFiles({
          agentName: config?.name || name,
          model: model || 'anthropic/claude-sonnet-4-20250514',
          provider: credentials?.provider || 'anthropic',
          credentials: credentials || {},
          personaId: persona,
        });

        const result = await openclawProvider.create({
          name,
          workspacePath: workspacePath || process.cwd(),
          projectRoot: workspacePath || process.cwd(),
          image,
          vnc: { enabled: true },
          providerOptions: { openclawConfig: config },
          openclawConfig,
          workspaceFiles,
          onLog: (line) => this.broadcast({ type: 'log', boxId: name, data: line }),
        });

        this.broadcast({ type: 'box:created', box: result.record });
        res.json(result);
      } catch (error) {
        console.error('Create box error:', error);
        res.status(500).json({ error: String(error) });
      }
    });

    // Start box
    this.app.post('/api/boxes/:id/start', async (req: Request, res: Response) => {
      try {
        const box = await openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        await openclawProvider.start(box);
        this.broadcast({ type: 'box:started', boxId: req.params.id });
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Stop box
    this.app.post('/api/boxes/:id/stop', async (req: Request, res: Response) => {
      try {
        const box = await openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        await openclawProvider.stop(box);
        this.broadcast({ type: 'box:stopped', boxId: req.params.id });
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Destroy box
    this.app.delete('/api/boxes/:id', async (req: Request, res: Response) => {
      try {
        const box = await openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        await openclawProvider.destroy(box);
        this.broadcast({ type: 'box:destroyed', boxId: req.params.id });
        res.json({ ok: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Execute command in box
    this.app.post('/api/boxes/:id/exec', async (req: Request, res: Response) => {
      try {
        const box = await openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        const { command } = req.body;
        const result = await openclawProvider.exec(box, command);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get VNC info
    this.app.get('/api/boxes/:id/vnc', async (req: Request, res: Response) => {
      try {
        const box = await openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        res.json({
          vncUrl: `vnc://localhost:${box.ports?.vnc}`,
          novncUrl: `http://localhost:${box.ports?.novnc}/vnc.html?autoconnect=true`,
        });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', async (ws: WebSocket) => {
      this.clients.add(ws);

      // Send initial state
      const boxes = await openclawProvider.list();
      ws.send(JSON.stringify({ type: 'init', boxes }));

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

  private broadcast(message: object): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`Agent Observatory running at http://0.0.0.0:${this.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    this.wss.close();
    this.server.close();
  }
}
