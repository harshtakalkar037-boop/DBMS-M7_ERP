import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { ping } from './config/database';
import { mongo } from './config/mongo';
import { logger } from './utils/logger';
import { queryOne, Row } from './config/database';

async function bootstrap(): Promise<void> {
  logger.info('Starting University ERP API...');

  const dbUp = await ping();
  if (!dbUp) {
    logger.error(
      `Cannot reach MySQL at ${env.db.host}:${env.db.port}/${env.db.database}. ` +
      'Start MariaDB/MySQL and run `bash scripts/reset-db.sh` first.',
    );
    process.exit(1);
  }

  const ver = await queryOne<Row>('SELECT VERSION() AS v');
  logger.info(`MySQL connected: ${env.db.database} (${String(ver?.v ?? 'unknown')})`);

  await mongo.connect();

  const app = createApp();
  const server = http.createServer(app);

  // Bind to all interfaces so the sandboxed preview proxy can reach the server.
  server.listen(env.port, '0.0.0.0', () => {
    logger.info(`API listening on http://0.0.0.0:${env.port}${env.apiPrefix}`);
    logger.info(`Health check: http://0.0.0.0:${env.port}${env.apiPrefix}/health`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received - shutting down gracefully`);
    server.close(async () => {
      await mongo.close().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error('Fatal startup error', err as Error);
  process.exit(1);
});
