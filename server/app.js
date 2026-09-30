import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/authRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import merchantRoutes from './routes/merchantRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import adminRoutes, { settlementRouter } from './routes/adminRoutes.js';
import { connectionCount } from './socket/realtime.js';
import { ApiError } from './utils/validate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render sits behind a proxy

  // CORS is wide open by design: during the demo the phones hit the laptop by
  // raw LAN IP, and that origin is not knowable ahead of time. A production
  // deployment would pin this to the real front-end origin.
  app.use(
    cors({
      origin: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.use(express.json({ limit: '256kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'UniPay',
      demoMode: true,
      simulated: true,
      liveConnections: connectionCount(),
      time: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/students', studentRoutes);
  app.use('/api/merchants', merchantRoutes);
  app.use('/api/payments', paymentRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/settlements', settlementRouter);

  // Alias required by the spec: POST /api/wallet/topup === POST /api/payments/topup
  app.use('/api/wallet', paymentRoutes);
  // Alias required by the spec: POST /api/sync === POST /api/payments/sync
  app.use('/api', paymentRoutes);

  // --- Static client (single-service Render deployment) ---
  const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // SPA fallback — anything that is not an API route renders index.html.
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, message: 'Endpoint not found.', code: 'NOT_FOUND' });
  });

  // --- Error handler ---
  // Every route throws ApiError for anything the user should see; anything else
  // is a bug and is reported generically while the real cause goes to the log.
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError || err?.expose) {
      return res.status(err.status ?? 400).json({
        ok: false,
        message: err.message,
        code: err.code ?? 'REQUEST_FAILED',
      });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ ok: false, message: 'Malformed request.', code: 'BAD_JSON' });
    }
    console.error('[unipay] unhandled error:', err);
    res.status(500).json({ ok: false, message: 'Central server unavailable.', code: 'SERVER_ERROR' });
  });

  return app;
}
