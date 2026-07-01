/**
 * Agent Observatory - Dashboard Server
 * 
 * REST API + WebSocket for managing OpenClaw agent boxes.
 */

import express, { type Express, type Request, type Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server } from 'http';
import { openclawProvider, type BoxRecord } from '../provider.js';
import * as path from 'path';
import * as fs from 'fs';

export interface DashboardServerOptions {
  port?: number;
  host?: string;
}

export class DashboardServer {
  private app: Express;
  private server: Server;
  private wss: WebSocketServer;
  private port: number;
  private host: string;
  private clients: Set<WebSocket> = new Set();

  constructor(options: DashboardServerOptions = {}) {
    this.port = options.port || 3456;
    this.host = options.host || '0.0.0.0';
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
    const staticDir = path.join(process.cwd(), 'dashboard', '.next', 'static');
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

    // List all boxes
    this.app.get('/api/boxes', async (req: Request, res: Response) => {
      try {
        const boxes = openclawProvider.list();
        const results = await Promise.all(boxes.map(async (box) => {
          const state = await openclawProvider.probeState(box);
          return { ...box, state };
        }));
        res.json(results);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get single box
    this.app.get('/api/boxes/:id', async (req: Request, res: Response) => {
      try {
        const box = openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        const inspected = await openclawProvider.inspect(box);
        res.json(inspected);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Create box
    this.app.post('/api/boxes', async (req: Request, res: Response) => {
      try {
        const { name, workspacePath, config, image, openclawConfig } = req.body;
        const result = await openclawProvider.create({
          name,
          workspacePath: workspacePath || process.cwd(),
          projectRoot: workspacePath || process.cwd(),
          image,
          vnc: { enabled: true },
          providerOptions: { openclawConfig: config },
          openclawConfig, // Full OpenClaw config with auth
          onLog: (line) => this.broadcast({ type: 'log', boxId: name, data: line }),
        });
        this.broadcast({ type: 'box:created', box: result.record });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Start box
    this.app.post('/api/boxes/:id/start', async (req: Request, res: Response) => {
      try {
        const box = openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        const result = await openclawProvider.start(box);
        this.broadcast({ type: 'box:started', boxId: box.id });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Stop box
    this.app.post('/api/boxes/:id/stop', async (req: Request, res: Response) => {
      try {
        const box = openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        await openclawProvider.stop(box);
        this.broadcast({ type: 'box:stopped', boxId: box.id });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Destroy box
    this.app.delete('/api/boxes/:id', async (req: Request, res: Response) => {
      try {
        const box = openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        await openclawProvider.destroy(box);
        this.broadcast({ type: 'box:destroyed', boxId: box.id });
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Exec in box
    this.app.post('/api/boxes/:id/exec', async (req: Request, res: Response) => {
      try {
        const box = openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        const { command, user, cwd } = req.body;
        const argv = Array.isArray(command) ? command : ['sh', '-c', command];
        const result = await openclawProvider.exec(box, argv, { user, cwd });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Get VNC URL
    this.app.get('/api/boxes/:id/vnc', async (req: Request, res: Response) => {
      try {
        const box = openclawProvider.get(req.params.id);
        if (!box) {
          res.status(404).json({ error: 'Box not found' });
          return;
        }
        const url = await openclawProvider.resolveUrl(box, { kind: 'vnc' });
        res.json({ url });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);
      
      // Send current state
      const boxes = openclawProvider.list();
      ws.send(JSON.stringify({ type: 'init', boxes }));

      ws.on('message', async (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          await this.handleWsMessage(ws, msg);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'error', error: String(error) }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });
  }

  private async handleWsMessage(ws: WebSocket, msg: { type: string; [key: string]: unknown }): Promise<void> {
    switch (msg.type) {
      case 'subscribe': {
        const boxId = msg.boxId as string;
        const unsubscribe = openclawProvider.subscribeActivity(boxId, (event) => {
          ws.send(JSON.stringify({ ...event, messageType: 'activity', boxId }));
        });
        ws.on('close', unsubscribe);
        break;
      }
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;
    }
  }

  private broadcast(message: object): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, this.host, () => {
        console.log(`Agent Observatory running at http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close();
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}
