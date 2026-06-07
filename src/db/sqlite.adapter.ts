import { randomUUID } from 'crypto';
import type { Client, InValue, Transaction } from '@libsql/client';
import { createClient } from '@libsql/client';

import { dbQueryDurationMicroseconds } from '../config/metrics';
import type { Db, DbClient, QueryResult } from './types';

// PG → SQLite SQL translations.
const CAST_RE = /::\s*[a-z_][\w]*(?:\s*\[\s*\])?/gi;
const EQ_ANY_RE = /=\s*ANY\s*\(\s*(\$\d+)\s*\)/gi;
const NEQ_ANY_RE = /<>\s*ANY\s*\(\s*(\$\d+)\s*\)/gi;
const NOW_RE = /\bnow\s*\(\s*\)/gi;
const GEN_UUID_RE = /\bgen_random_uuid\s*\(\s*\)/gi;

function adapt(v: unknown): InValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'bigint') return v;
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (v instanceof Uint8Array || v instanceof ArrayBuffer) return v as InValue;
  // arrays/objects → JSON text (matches the migration script's encoding)
  return JSON.stringify(v);
}

function translate(sql: string, params?: unknown[]): { sql: string; args: InValue[] } {
  let s = sql.replace(CAST_RE, '');
  s = s.replace(EQ_ANY_RE, 'IN ($1)').replace(NEQ_ANY_RE, 'NOT IN ($1)');
  s = s.replace(NOW_RE, "datetime('now')");
  // gen_random_uuid() has no SQLite equivalent and libsql/client can't register
  // host functions, so inline a fresh UUID literal at translation time.
  s = s.replace(GEN_UUID_RE, () => `'${randomUUID()}'`);

  // Note: array params expand to a bare `?, ?, ?` list (no enclosing parens).
  // Call sites must wrap with parens themselves — e.g. `IN ($N)` or `VALUES ($N)`.
  // The `= ANY($N)` rewriter above already supplies `IN (...)` parens, and PG-style
  // `WHERE c IN ($N)` already has them.
  const args: InValue[] = [];
  s = s.replace(/\$(\d+)/g, (_match, idx) => {
    const i = parseInt(idx, 10) - 1;
    const raw = params?.[i];
    if (Array.isArray(raw)) {
      if (raw.length === 0) return 'NULL'; // empty list inside IN(...) → no matches
      for (const item of raw) args.push(adapt(item));
      return raw.map(() => '?').join(', ');
    }
    args.push(adapt(raw));
    return '?';
  });

  return { sql: s, args };
}

type Executor = Pick<Client | Transaction, 'execute'>;

class LibsqlClient implements DbClient {
  constructor(private readonly executor: Executor) {}

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>> {
    const end = dbQueryDurationMicroseconds.startTimer({ query: sql });
    try {
      const translated = translate(sql, params);
      const res = await this.executor.execute({ sql: translated.sql, args: translated.args });
      // Row is array-like with property access by column name; cast to T.
      const rows = res.rows as unknown as T[];
      return { rows, rowCount: typeof res.rowsAffected === 'number' ? res.rowsAffected : rows.length };
    } finally {
      end();
    }
  }
}

export interface SqliteDbConfig {
  url: string; // 'file:album_pg.sqlite' for local, 'libsql://<db>.turso.io' for Turso
  authToken?: string;
}

export class SqliteDb implements Db {
  readonly dialect = 'sqlite' as const;
  private readonly client: Client;
  private readonly wrapper: LibsqlClient;

  constructor(config: SqliteDbConfig) {
    // Strip ALL whitespace (including newlines/spaces injected mid-token by env-var
    // UIs that wrap long values). JWTs never contain whitespace; any \s in the value
    // is corruption. With only .trim() Render's mid-string wrap still breaks the
    // Authorization header (undici rejects newlines in header values).
    const url = config.url.replace(/\s+/g, '');
    const authToken = config.authToken?.replace(/\s+/g, '') || undefined;
    this.client = createClient({ url, authToken, intMode: 'number' });
    this.wrapper = new LibsqlClient(this.client);
  }

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    return this.wrapper.query<T>(sql, params);
  }

  async transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    const tx = await this.client.transaction('write');
    try {
      const result = await fn(new LibsqlClient(tx));
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback().catch(() => undefined);
      throw err;
    } finally {
      tx.close();
    }
  }

  end(): Promise<void> {
    this.client.close();
    return Promise.resolve();
  }
}
