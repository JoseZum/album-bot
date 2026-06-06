import { loadEnv } from '../config/env';
import { PgDb } from './pg.adapter';
import { SqliteDb } from './sqlite.adapter';
import type { Db } from './types';

loadEnv();

function build(): Db {
  const driver = (process.env.DB_DRIVER ?? 'pg').toLowerCase();
  if (driver === 'sqlite' || driver === 'libsql' || driver === 'turso') {
    const url = process.env.LIBSQL_URL ?? process.env.SQLITE_URL;
    if (!url) {
      throw new Error('DB_DRIVER=sqlite requires LIBSQL_URL (e.g. "file:album_pg.sqlite" or "libsql://<db>.turso.io")');
    }
    return new SqliteDb({ url, authToken: process.env.LIBSQL_AUTH_TOKEN });
  }
  return PgDb.fromConfig({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('render.com') ? { rejectUnauthorized: false } : false,
  });
}

export const db: Db = build();
export type { Db, DbClient, QueryResult } from './types';
