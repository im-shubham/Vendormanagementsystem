import pg from 'pg';
import { env } from '../config/env.js';

// Return DATE columns as 'YYYY-MM-DD' strings instead of JS Date (avoids TZ shifts)
pg.types.setTypeParser(1082, (v) => v);
// bigint (file sizes, counts) as number
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  max: 10,
});

pool.on('error', (err) => console.error('Unexpected PostgreSQL pool error', err));

export type Db = pg.PoolClient;

type Hook = () => unknown | Promise<unknown>;
const commitHooks = new WeakMap<Db, Hook[]>();

/** Run `cb` only after the surrounding transaction commits (e.g. notifications). */
export function afterCommit(db: Db, cb: Hook) {
  const list = commitHooks.get(db);
  if (list) list.push(cb);
  else void Promise.resolve().then(cb);
}

async function runInTransaction<T>(setup: (c: Db) => Promise<void>, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const hooks: Hook[] = [];
  commitHooks.set(client, hooks);
  try {
    await client.query('begin');
    await setup(client);
    const result = await fn(client);
    await client.query('commit');
    commitHooks.delete(client);
    for (const h of hooks) {
      try {
        await h();
      } catch (err) {
        console.error('after-commit hook failed', err);
      }
    }
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    commitHooks.delete(client);
    client.release();
  }
}

/**
 * System context: privileged connection that bypasses RLS.
 * Use ONLY for operations that have no end-user identity yet
 * (login status checks, first-time activation, system notifications).
 */
export function withSystem<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  return runInTransaction(async () => undefined, fn);
}

/**
 * User context: runs inside a transaction as the `authenticated` role with
 * the caller's JWT subject, so PostgreSQL Row Level Security is enforced
 * exactly as it would be for Supabase PostgREST.
 */
export function withUser<T>(authUserId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  return runInTransaction(async (client) => {
    await client.query(
      `select set_config('request.jwt.claims', $1, true),
              set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', 'authenticated', true)`,
      [JSON.stringify({ sub: authUserId, role: 'authenticated' }), authUserId],
    );
    await client.query('set local role authenticated');
  }, fn);
}
