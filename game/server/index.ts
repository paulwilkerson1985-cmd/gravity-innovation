// Entry point: `npm run server` (PORT, HOST, STATIC_DIR, TURN_SECONDS env vars; see docs/ONLINE.md).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createArenaServer } from './server';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const defaultStatic = join(here, '..', 'dist');
const staticDir = process.env.STATIC_DIR ?? (existsSync(join(defaultStatic, 'index.html')) ? defaultStatic : null);
const turnSeconds = Number(process.env.TURN_SECONDS ?? 45);

// Last line of defence: a bug triggered by one request/socket message is logged, never fatal.
process.on('uncaughtException', (err) => console.error('[arena] uncaught exception (continuing):', err));
process.on('unhandledRejection', (err) => console.error('[arena] unhandled rejection (continuing):', err));

const server = await createArenaServer({
  port,
  host: process.env.HOST,
  staticDir,
  room: { turnMs: Math.max(5, turnSeconds) * 1000 },
  log: (m) => console.log(`[arena] ${m}`),
});
console.log(`[arena] listening on :${server.port}${staticDir ? ` (serving ${staticDir})` : ''} — GET /health`);

const stop = () => { void server.close().then(() => process.exit(0)); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
