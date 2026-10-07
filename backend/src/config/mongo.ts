import { MongoClient, Db, Collection } from 'mongodb';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * OPTIONAL MongoDB component (project brief section 3).
 *
 * Justification: MySQL is the system of record for all transactional, relational
 * data. Two workloads are a poor fit for it:
 *
 *   1. audit / activity events - append only, very high volume, read only by time
 *      range, and never joined to anything;
 *   2. AI assistant conversation history - free-form, variable shape, per-user
 *      time ordered documents.
 *
 * Both are mirrored to MongoDB when MONGODB_URI is configured. The relational
 * tables remain the source of truth, so the application behaves identically with
 * or without MongoDB - nothing is faked, the store is simply optional.
 */
interface AuditEvent {
  userId: number | null;
  action: string;
  entity: string;
  entityId: number | null;
  description: string | null;
  at: Date;
  ip: string | null;
}

interface ChatMessage {
  userId: number;
  sessionId: string;
  role: 'USER' | 'ASSISTANT';
  message: string;
  source: 'LOCAL_ENGINE' | 'LLM';
  createdAt: Date;
}

/** Typed access to the two mirrored collections. Null when Mongo is not configured. */
export function getCollections(): {
  auditEvents: Collection<AuditEvent> | null;
  aiMessages: Collection<ChatMessage> | null;
} {
  return {
    auditEvents: mongo.coll<AuditEvent>('audit_events'),
    aiMessages: mongo.coll<ChatMessage>('ai_conversations'),
  };
}

/** Small status blob used by /health so the UI can show whether mirroring is on. */
export function mongoStatus(): { enabled: boolean; connected: boolean; database: string; collections: string[] } {
  return {
    enabled: mongo.enabled,
    connected: mongo.available,
    database: env.mongo.db,
    collections: mongo.available ? ['audit_events', 'ai_conversations'] : [],
  };
}

class MongoStore {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private connecting: Promise<void> | null = null;
  public available = false;

  get enabled(): boolean {
    return env.mongo.enabled && !!env.mongo.uri;
  }

  async connect(): Promise<void> {
    if (!this.enabled || this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        this.client = new MongoClient(env.mongo.uri, { serverSelectionTimeoutMS: 3000 });
        await this.client.connect();
        this.db = this.client.db(env.mongo.db);
        this.available = true;
        logger.info(`MongoDB connected (${env.mongo.db}) - audit + AI history mirroring ON`);
      } catch (err) {
        this.available = false;
        logger.warn(`MongoDB unavailable (${(err as Error).message}) - continuing with MySQL only`);
      }
    })();
    return this.connecting;
  }

  coll<T extends Record<string, any>>(name: string): Collection<T> | null {
    if (!this.db) return null;
    return this.db.collection<T>(name);
  }

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    const c = this.coll<AuditEvent>('audit_events');
    if (!c) return;
    try {
      await c.insertOne(event);
    } catch {
      /* never block the request path */
    }
  }

  async recentAuditEvents(limit = 50): Promise<AuditEvent[]> {
    const c = this.coll<AuditEvent>('audit_events');
    if (!c) return [];
    try {
      return await c.find({}).sort({ at: -1 }).limit(limit).toArray();
    } catch {
      return [];
    }
  }

  async appendChat(msg: ChatMessage): Promise<void> {
    const c = this.coll<ChatMessage>('ai_conversations');
    if (!c) return;
    try {
      await c.insertOne(msg);
    } catch {
      /* ignore */
    }
  }

  async chatHistory(userId: number, sessionId: string, limit = 30): Promise<ChatMessage[]> {
    const c = this.coll<ChatMessage>('ai_conversations');
    if (!c) return [];
    try {
      return await c
        .find({ userId, sessionId })
        .sort({ createdAt: 1 })
        .limit(limit)
        .toArray();
    } catch {
      return [];
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.available = false;
    }
  }
}

export const mongo = new MongoStore();
export type { AuditEvent, ChatMessage };
