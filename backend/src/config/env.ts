import path from 'path';
import dotenv from 'dotenv';

// Load .env from the backend folder (or the repository root when running from dist)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const bool = (v: string | undefined, fallback = false): boolean =>
  v === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const int = (v: string | undefined, fallback: number): number => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: int(process.env.PORT, 8080),
  apiPrefix: process.env.API_PREFIX ?? '/api/v1',

  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: int(process.env.DB_PORT, 3306),
    user: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'university_erp',
    connectionLimit: int(process.env.DB_CONNECTION_LIMIT, 15),
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-only-insecure-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-only-insecure-refresh-change-me',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },

  bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10),
  corsOrigin: (process.env.CORS_ORIGIN ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  mongo: {
    uri: process.env.MONGODB_URI ?? '',
    db: process.env.MONGODB_DB ?? 'university_erp_events',
    enabled: bool(process.env.MONGODB_URI ? 'true' : 'false'),
  },

  ai: {
    mode: (process.env.AI_MODE ?? 'local') as 'local' | 'llm',
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    /** True only when the user explicitly enabled llm mode AND supplied a key. */
    get llmEnabled(): boolean {
      return this.mode === 'llm' && this.apiKey.length > 0;
    },
  },

  uploads: {
    dir: process.env.UPLOAD_DIR ?? './uploads',
    maxMb: int(process.env.MAX_UPLOAD_MB, 5),
  },
};

export const isProduction = env.nodeEnv === 'production';
