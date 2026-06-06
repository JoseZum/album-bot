import { Pool, type PoolClient, type PoolConfig } from 'pg';

import { activeDbConnections, dbQueryDurationMicroseconds } from '../config/metrics';
import type { Db, DbClient, QueryResult } from './types';

function instrument<T>(
  sql: string,
  run: () => Promise<{ rows: T[]; rowCount: number | null } | Array<{ rows: T[]; rowCount: number | null }>>,
): Promise<QueryResult<T>> {
  const end = dbQueryDurationMicroseconds.startTimer({ query: sql });
  return run()
    .then((res) => {
      // pg returns Result[] for multi-statement queries (used in test setup, e.g. TRUNCATE ...; ALTER SEQUENCE ...).
      if (Array.isArray(res)) {
        return { rows: [] as T[], rowCount: 0 };
      }
      const rows = res.rows ?? ([] as T[]);
      return { rows, rowCount: res.rowCount ?? rows.length };
    })
    .finally(end);
}

export class PgDb implements Db {
  readonly dialect = 'pg' as const;
  constructor(private readonly pool: Pool) {
    pool.on('connect', () => activeDbConnections.inc());
    pool.on('remove', () => activeDbConnections.dec());
  }

  static fromConfig(config: PoolConfig): PgDb {
    return new PgDb(new Pool(config));
  }

  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    return instrument(sql, () => this.pool.query<T extends Record<string, unknown> ? T : never>(sql, params as unknown[]));
  }

  async transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(wrapClient(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  end(): Promise<void> {
    return this.pool.end();
  }
}

function wrapClient(client: PoolClient): DbClient {
  return {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
      return instrument(sql, () => client.query<T extends Record<string, unknown> ? T : never>(sql, params as unknown[]));
    },
  };
}
