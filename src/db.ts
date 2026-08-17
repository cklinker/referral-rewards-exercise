/**
 * Test harness — you should not need to change anything in this file.
 *
 * In production this code runs in a Lambda against RDS Postgres through a
 * `pg` Pool. For the exercise we run a real Postgres compiled to WASM
 * (PGlite) in-process, so there is nothing to install or start. The `Db`
 * interface below is deliberately the same shape a `pg` Pool/Client gives you.
 */
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface QueryResult<T> {
  rows: T[];
  /** Rows returned, or rows affected for a write with no RETURNING clause. */
  rowCount: number;
}

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  /** Runs `fn` inside a single transaction. Throwing rolls the whole thing back. */
  tx<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }>;
};

export interface TestDb extends Db {
  /** Number of SQL statements issued since the last resetQueryCount(). */
  queryCount(): number;
  resetQueryCount(): void;
  close(): Promise<void>;
}

function wrap(target: Queryable, bump: () => void, tx: Db['tx']): Db {
  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
      bump();
      const res = await target.query(sql, params);
      const rows = res.rows as T[];
      return { rows, rowCount: rows.length > 0 ? rows.length : (res.affectedRows ?? 0) };
    },
    tx,
  };
}

export async function createTestDb(): Promise<TestDb> {
  const pg = await PGlite.create();

  const sqlDir = join(__dirname, '..', 'sql');
  for (const file of readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(readFileSync(join(sqlDir, file), 'utf8'));
  }

  let count = 0;
  const bump = () => {
    count += 1;
  };

  const root: TestDb = {
    ...wrap(pg, bump, async (fn) => {
      return pg.transaction(async (t) => {
        const inner = wrap(t as unknown as Queryable, bump, () => {
          throw new Error('nested transactions are not supported');
        });
        return fn(inner);
      }) as Promise<never>;
    }),
    queryCount: () => count,
    resetQueryCount: () => {
      count = 0;
    },
    close: () => pg.close(),
  };

  return root;
}

/** Wipes all data between tests without paying to boot Postgres again. */
export async function truncateAll(db: Db): Promise<void> {
  await db.query('TRUNCATE reward_credits, referrals, organizations RESTART IDENTITY CASCADE');
}
