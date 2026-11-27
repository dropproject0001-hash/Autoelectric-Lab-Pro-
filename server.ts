import express from 'express';
import { createServer as createViteServer, type ViteDevServer } from 'vite';
import { createAutoelectricApiApp } from './src/server/createApiApp';
import { logFirebaseAuthStartupDiagnostics } from './src/server/services/firebaseAuthMiddleware';
import { attachGeminiLiveVoiceWebSocket } from './src/server/services/geminiLiveVoiceServer';
import dotenv from 'dotenv';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

dotenv.config();

const rootDir = process.cwd();

function getCliArgValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  const prefix = `${flag}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length) : undefined;
}

function resolveListenPort(): number {
  const cliPort = getCliArgValue('--port');
  if (cliPort) {
    const parsedCli = Number(cliPort);
    if (Number.isFinite(parsedCli) && parsedCli > 0) {
      return parsedCli;
    }
  }

  const rawPort = process.env.PORT;
  const nginxPort = process.env.NGINX_PORT;
  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT) || 3000;

  if (!rawPort) {
    return defaultAppPort;
  }
  // In the AI Studio container, NGINX_PORT is 8080 and nginx owns :8080;
  // always bind the app server to DEFAULT_APP_PORT (3000) in that environment.
  if (nginxPort && rawPort === nginxPort) {
    return defaultAppPort;
  }
  const parsed = Number(rawPort);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultAppPort;
}

function resolveListenHost(): string {
  return getCliArgValue('--host') || '0.0.0.0';
}

async function startServer() {
  logFirebaseAuthStartupDiagnostics();
  const app = createAutoelectricApiApp();
  const httpServer = http.createServer(app);
  const liveVoiceWs = attachGeminiLiveVoiceWebSocket(httpServer);
  const isProduction = process.env.NODE_ENV === 'production';
  const port = resolveListenPort();
  const host = resolveListenHost();

  // Ensure Service Worker and Web App Manifest headers are always served with compliant MIME & cache policies
  app.use((req, res, next) => {
    if (req.path === '/sw.js') {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Service-Worker-Allowed', '/');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      if (!isProduction) {
        const swSourcePath = path.resolve(rootDir, 'src/sw.js');
        if (fs.existsSync(swSourcePath)) {
          res.sendFile(swSourcePath);
          return;
        }
      }
    } else if (req.path === '/manifest.webmanifest' || req.path === '/manifest.json') {
      res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
    }
    next();
  });

  let viteInstance: ViteDevServer | null = null;

  if (!isProduction) {
    // Disable standalone HMR WebSocket server in AI Studio container (or when DISABLE_HMR=true)
    // to prevent port 24678 conflicts and file-watcher overhead during dev server restarts.
    const disableHmr =
      process.env.DISABLE_HMR === 'true' || Boolean(process.env.NGINX_PORT);
    if (disableHmr) {
      process.env.DISABLE_HMR = 'true';
    }

    const vitePromise = createViteServer({
      server: {
        middlewareMode: true,
        ws: disableHmr ? false : undefined,
        hmr: disableHmr ? false : { server: httpServer },
        watch: disableHmr ? null : {},
      },
      appType: 'custom',
    });

    // Attach settlement handler so initialization errors never cause an unhandled promise rejection
    vitePromise.then(
      (server) => {
        viteInstance = server;
      },
      (err) => {
        console.error('Vite middleware initialization failed:', err);
      }
    );

    app.use(async (req, res, next) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });

    // Serve HTML with Vite dev transform for script loading
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const vite = await vitePromise;
        const indexPath = path.resolve(rootDir, 'index.html');
        let template = fs.readFileSync(indexPath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(template);
      } catch (e) {
        try {
          const vite = await vitePromise;
          vite.ssrFixStacktrace(e as Error);
        } catch {
          // Ignore stacktrace fix failure if vite failed to initialize
        }
        next(e);
      }
    });
  } else {
    // Production mode: serve built assets from dist
    const distPath = path.resolve(rootDir, 'dist');
    app.use(express.static(distPath));

    app.use('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down Autoelectric Lab server...`);
    const forceExitTimer = setTimeout(() => process.exit(0), 1500);
    forceExitTimer.unref();

    liveVoiceWs.closeAll();
    httpServer.closeIdleConnections?.();
    httpServer.close(() => {
      Promise.race([
        Promise.resolve(viteInstance?.close()).catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]).finally(() => process.exit(0));
    });
    httpServer.closeAllConnections?.();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    console.error(`Server failed to bind http://${host}:${port}:`, err.message);
    process.exit(1);
  });

  httpServer.listen(port, host, () => {
    console.log(
      `Autoelectric Lab server listening on http://${host}:${port} [${isProduction ? 'PROD' : 'DEV'}]`
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
