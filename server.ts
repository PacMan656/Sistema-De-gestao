import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './src/server/routes.ts';
import { attachSocketServer } from './src/server/socket.ts';
import { needsSetup, setupToken, setupTokenPath } from './src/server/setup.ts';
import { logFailure } from './src/server/safeLog.ts';
import { closeDatabase } from './src/db/index.ts';
import { apiNotFound, apiErrorHandler } from './src/server/apiBoundary.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  const firstSetup = await needsSetup();
  if (firstSetup && process.env.PATRITI_DESKTOP !== '1') {
    console.log(`Primeiro acesso: consulte o código de configuração no arquivo local ${setupTokenPath}.`);
  }
  const app = express();
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
  const server = http.createServer(app);

  app.use(express.json({ limit: '2mb' }));

  // Mount REST API
  app.use('/api', apiRouter);
  app.use('/api', apiNotFound);
  app.use('/api', apiErrorHandler);

  // Attach authenticated Socket.IO WebSocket server on same HTTP server & port
  const sockets = attachSocketServer(server);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.env.PATRITI_ROOT_DIR || __dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = process.env.PORT === undefined ? 3000 : Number(process.env.PORT);
  server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : PORT;
    console.log(`PatriTI server running on http://localhost:${port}`);
    const parentPort = (process as unknown as { parentPort?: { postMessage(data: unknown): void } }).parentPort;
    parentPort?.postMessage({ type: 'ready', port, setupToken: firstSetup ? setupToken : null });
  });
  const shutdown = () => sockets.close(() => { void closeDatabase().then(() => process.exit(0)); });
  const parentPort = (process as unknown as { parentPort?: { on(name: string, callback: (event: { data?: unknown }) => void): void } }).parentPort;
  parentPort?.on('message', event => { if (event.data === 'shutdown') shutdown(); });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  logFailure('server.start', err);
  process.exit(1);
});
