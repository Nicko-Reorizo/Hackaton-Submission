import express from 'express';
import cors from 'cors';
import { authenticate } from './auth.js';
import { errorHandler, HttpError } from './errors.js';
import { createReportRouter } from './routes/reports.js';
import { createDirectoryRouter } from './routes/directory.js';

// Dependencies are injectable so authorization and routes can be tested offline.
export function createApp({ config, Report, Office, Account, adminAuth, verifyToken, analyzeImage, photoStorage }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({
    origin(origin, callback) {
      // Native mobile requests do not have a browser Origin header.
      if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
      callback(new HttpError(403, 'This browser origin is not permitted.'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json({ limit: '12mb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api/lgu', authenticate(verifyToken), createDirectoryRouter({ config, Office, Account, adminAuth }));
  app.use('/api/reports', authenticate(verifyToken), createReportRouter({ Report, Office, Account, analyzeImage, photoStorage, config }));
  app.use((_req, _res, next) => next(new HttpError(404, 'Endpoint not found.')));
  app.use(errorHandler);
  return app;
}
