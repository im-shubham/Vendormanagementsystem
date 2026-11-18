import { createApp } from './app.js';
import { env } from './config/env.js';
import { authProvider } from './auth/index.js';
import { pool } from './db/pool.js';
import { storage } from './storage/index.js';

async function main() {
  await pool.query('select 1');
  await storage.init();
  const app = createApp();
  app.listen(env.PORT, () => {
    console.info(`RCPL POD API listening on http://localhost:${env.PORT} (auth: ${authProvider.name}, storage: ${storage.name})`);
  });
}

main().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
