export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
}

export type DbDialect = 'pg' | 'sqlite';

export interface Db extends DbClient {
  readonly dialect: DbDialect;
  transaction<T>(fn: (client: DbClient) => Promise<T>): Promise<T>;
  end(): Promise<void>;
}
