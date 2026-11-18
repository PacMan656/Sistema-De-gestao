import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './src/server/routes.ts';
import { attachSocketServer } from './src/server/socket.ts';
import { needsSetup, setupToken } from './src/server/setup.ts';
import { closeDatabase } from './src/db/index.ts';
import { apiNotFound, apiErrorHandler } from './src/server/apiBoundary.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  if (await needsSetup()) {
    console.log(`Primeiro acesso: crie o administrador de TI na página de login. Código de configuração: ${setupToken}`);
  }
  const app = express();
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
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`PatriTI server running on http://localhost:${PORT}`);
  });
  const shutdown = () => sockets.close(() => { void closeDatabase().then(() => process.exit(0)); });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
