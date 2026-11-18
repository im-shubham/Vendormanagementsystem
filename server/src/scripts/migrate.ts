/**
 * Applies SQL migrations from /supabase/migrations in filename order and
 * records them in public.schema_migrations. Safe to run repeatedly.
 *
 * With AUTH_PROVIDER=local on a plain PostgreSQL server, the local auth shim
 * (supabase/local/000_local_auth_shim.sql) is applied first.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../config/env.js';
import { pool } from '../db/pool.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../supabase');

async function main() {
  const { rows } = await pool.query(`select to_regclass('auth.users') is not null as has_auth`);
  if (!rows[0].has_auth) {
    if (env.AUTH_PROVIDER !== 'local') {
      throw new Error('auth.users not found. Point DATABASE_URL at your Supabase database, or use AUTH_PROVIDER=local for plain PostgreSQL.');
    }
    console.info('Applying local auth shim (plain PostgreSQL detected)…');
    await pool.query(await fs.readFile(path.join(root, 'local/000_local_auth_shim.sql'), 'utf8'));
  }

  await pool.query(`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  await pool.query(`revoke all on public.schema_migrations from public`);
  const applied = new Set((await pool.query('select name from public.schema_migrations')).rows.map((r) => r.name));

  const files = (await fs.readdir(path.join(root, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await fs.readFile(path.join(root, 'migrations', file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.info(`✔ applied ${file}`);
    } catch (err) {
      await client.query('rollback');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  console.info('Database is up to date.');
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
