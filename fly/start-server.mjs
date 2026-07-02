// Launcher for the Box Claws dashboard API on Fly.io.
import { DashboardServer } from '../dist/dashboard/server.js';

const server = new DashboardServer({ port: parseInt(process.env.BOXCLAWS_PORT || '3457', 10) });
await server.start();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await server.stop();
    process.exit(0);
  });
}
