import { env } from '../config/env';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;
const threshold: number = env.nodeEnv === 'production' ? LEVELS.info : LEVELS.debug;

const stamp = () => new Date().toISOString();

function write(level: Level, message: string, meta?: unknown): void {
  if (LEVELS[level] < threshold) return;
  const prefix = `${stamp()} [${level.toUpperCase()}]`;
  // eslint-disable-next-line no-console
  if (meta !== undefined) console[level === 'debug' ? 'log' : level](prefix, message, meta);
  // eslint-disable-next-line no-console
  else console[level === 'debug' ? 'log' : level](prefix, message);
}

export const logger = {
  debug: (m: string, meta?: unknown) => write('debug', m, meta),
  info: (m: string, meta?: unknown) => write('info', m, meta),
  warn: (m: string, meta?: unknown) => write('warn', m, meta),
  error: (m: string, meta?: unknown) => write('error', m, meta),
};
