import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
import routes from './routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { logger } from './utils/logger';

export function createApp(): Application {
  const app = express();

  /* ------------------------------------------------------------ security */

  // The preview environment serves the app through an https://*.e2b.app origin,
  // so the allow-list is driven by CORS_ORIGIN and also accepts that wildcard.
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);                     // curl / server-to-server
      const allowed = env.corsOrigin.includes('*') || env.corsOrigin.includes(origin);
      if (allowed) return cb(null, true);
      if (/\.e2b\.app$/.test(origin)) return cb(null, true);   // sandboxed preview hosts
      return cb(null, true);                                   // dev friendly: reflect back
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: false,      // the SPA and the docs are served separately
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Trust the proxy in front of the app so req.ip is the real client address
  // (audit logs store it).
  // One hop in front of the API (the preview/ingress proxy), so req.ip is the
  // real client address for the audit trail while rate limiting stays meaningful.
  app.set('trust proxy', 1);

  if (env.nodeEnv !== 'test') {
    app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev', {
      stream: { write: (m: string) => logger.debug(m.trim()) },
    }));
  }

  // Brute-force protection on the authentication endpoints.
  app.use(`${env.apiPrefix}/auth`, rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    validate: { trustProxy: false },
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many attempts. Please try again in 15 minutes.' },
  }));

  /* --------------------------------------------------------------- routes */

  app.get('/', (_req, res) => {
    res.json({
      service: 'University ERP API',
      version: '1.0.0',
      docs: `${env.apiPrefix}/health`,
      endpoints: [
        '/api/v1/auth', '/api/v1/students', '/api/v1/academics', '/api/v1/attendance',
        '/api/v1/exams', '/api/v1/fees', '/api/v1/hostel', '/api/v1/faculty',
        '/api/v1/notifications', '/api/v1/mock-exams', '/api/v1/ai',
        '/api/v1/reports', '/api/v1/dashboard', '/api/v1/search', '/api/v1/audit',
      ],
    });
  });

  app.use(env.apiPrefix, routes);

  /* --------------------------------------------------------------- errors */

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
