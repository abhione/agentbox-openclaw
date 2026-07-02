/**
 * Public VNC proxy for hosted Box Claws (e.g. Fly.io).
 *
 * Exposes ONE public port (default 8080) that path-routes to each box's local
 * noVNC port:
 *
 *   /vnc/{token}/{boxIdOrName}/...  ->  http://127.0.0.1:{box.ports.novnc}/...
 *
 * Auth: a strong random token (env VNC_PROXY_TOKEN). The preferred URL form
 * embeds the token as the first path segment so all of noVNC's relative asset
 * and websocket requests are automatically authenticated with zero cookie
 * dependence (works inside cross-origin iframes). For compatibility we also
 * accept `?token=` (which sets a `vnc_token` cookie) and the cookie itself.
 *
 * WebSocket upgrades (websockify traffic) are proxied too.
 *
 * The dashboard API itself (port 3457) has no auth and must NEVER be exposed
 * publicly — only this proxy should get a public service mapping.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import type { Duplex } from 'stream';
import { timingSafeEqual } from 'crypto';
import httpProxy from 'http-proxy';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const STATE_FILE = path.join(os.homedir(), '.agentbox', 'openclaw', 'boxes.json');

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function findNovncPort(ref: string): number | null {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    const box = (data.boxes || []).find(
      (b: any) => b.id === ref || (b.name || '').toLowerCase() === String(ref).toLowerCase()
    );
    return box?.ports?.novnc ?? null;
  } catch {
    return null;
  }
}

interface RouteResult {
  port: number;
  /** Rewritten path+query to send upstream */
  url: string;
  /** True when auth came from ?token= (so we set the cookie) */
  setCookie: boolean;
}

function route(req: IncomingMessage, token: string): RouteResult | 'unauthorized' | 'notfound' | null {
  const u = new URL(req.url || '/', 'http://localhost');
  let parts = u.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'vnc') return null;
  parts = parts.slice(1);

  let authed = false;
  let setCookie = false;

  // Preferred: token as first path segment
  if (parts.length > 0 && safeEqual(parts[0], token)) {
    authed = true;
    parts = parts.slice(1);
  } else {
    const qtok = u.searchParams.get('token');
    if (qtok && safeEqual(qtok, token)) {
      authed = true;
      setCookie = true;
    } else {
      const ctok = parseCookies(req.headers.cookie)['vnc_token'];
      if (ctok && safeEqual(ctok, token)) authed = true;
    }
  }
  if (!authed) return 'unauthorized';
  if (parts.length === 0) return 'notfound';

  const boxRef = decodeURIComponent(parts[0]);
  const port = findNovncPort(boxRef);
  if (!port) return 'notfound';

  u.searchParams.delete('token');
  const rest = '/' + parts.slice(1).join('/');
  const qs = u.searchParams.toString();
  return { port, url: (rest === '/' ? '/vnc.html' : rest) + (qs ? `?${qs}` : ''), setCookie };
}

export interface VncProxyOptions {
  port?: number;
  token: string;
}

export function startVncProxy(options: VncProxyOptions): Server {
  const listenPort = options.port || 8080;
  const token = options.token;

  const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true });
  proxy.on('error', (err: Error, _req: unknown, res: unknown) => {
    const r = res as ServerResponse | Duplex | undefined;
    if (r && 'writeHead' in r && typeof (r as ServerResponse).writeHead === 'function' && !(r as ServerResponse).headersSent) {
      (r as ServerResponse).writeHead(502, { 'Content-Type': 'text/plain' });
      (r as ServerResponse).end('Upstream VNC error');
    } else if (r && 'destroy' in r) {
      (r as Duplex).destroy();
    }
  });

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const u = new URL(req.url || '/', 'http://localhost');
    if (u.pathname === '/vnc/health-check' || u.pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'boxclaws-vnc-proxy' }));
      return;
    }

    const result = route(req, token);
    if (result === null) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    if (result === 'unauthorized') {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }
    if (result === 'notfound') {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Box not found');
      return;
    }

    if (result.setCookie) {
      res.setHeader(
        'Set-Cookie',
        `vnc_token=${encodeURIComponent(token)}; Path=/vnc; HttpOnly; Secure; SameSite=None; Max-Age=86400`
      );
    }

    req.url = result.url;
    proxy.web(req, res, { target: `http://127.0.0.1:${result.port}` });
  });

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const result = route(req, token);
    if (result === null || result === 'unauthorized' || result === 'notfound') {
      socket.destroy();
      return;
    }
    req.url = result.url;
    proxy.ws(req, socket, head, { target: `http://127.0.0.1:${result.port}` });
  });

  server.listen(listenPort, () => {
    console.log(`🔐 VNC proxy listening on :${listenPort} (token auth)`);
  });

  return server;
}

/**
 * Build a public noVNC URL for a box, if the proxy is configured.
 * Uses env: VNC_PUBLIC_BASE (e.g. https://agentwork-boxes.fly.dev),
 * VNC_PROXY_TOKEN.
 */
export function publicVncUrl(box: { id: string; ports?: { novnc?: number } }): string | undefined {
  const base = process.env.VNC_PUBLIC_BASE;
  const token = process.env.VNC_PROXY_TOKEN;
  if (!base || !token || !box.ports?.novnc) return undefined;
  const prefix = `vnc/${encodeURIComponent(token)}/${encodeURIComponent(box.id)}`;
  return `${base.replace(/\/$/, '')}/${prefix}/vnc.html?autoconnect=true&path=${encodeURIComponent(prefix + '/websockify')}`;
}
