/**
 * Creates an RCPL admin login.
 *   npm run create-admin -- --email admin@rcpl.example --password 'Str0ng@Pass' --name "Admin User"
 */
import { parseArgs } from 'node:util';
import { authProvider } from '../auth/index.js';
import { pool } from '../db/pool.js';
import { emailSchema, passwordSchema } from '../utils/validation.js';

export async function createAdmin(email: string, password: string, name: string) {
  const e = emailSchema.parse(email);
  const pw = passwordSchema.safeParse(password);
  if (!pw.success) throw new Error(pw.error.issues[0].message);
  const { rows } = await pool.query('select 1 from public.user_profiles where lower(email) = lower($1)', [e]);
  if (rows.length) return false;
  const userId = await authProvider.createUser(e, password);
  try {
    await pool.query(
      `insert into public.user_profiles (auth_user_id, role, full_name, email) values ($1, 'ADMIN', $2, lower($3))`,
      [userId, name, e],
    );
  } catch (err) {
    await authProvider.deleteUser(userId);
    throw err;
  }
  return true;
}

const isMain = process.argv[1]?.includes('create-admin');
if (isMain) {
  const { values } = parseArgs({
    options: { email: { type: 'string' }, password: { type: 'string' }, name: { type: 'string', default: 'RCPL Admin' } },
  });
  if (!values.email || !values.password) {
    console.error('Usage: npm run create-admin -- --email <email> --password <password> [--name "Full Name"]');
    process.exit(1);
  }
  createAdmin(values.email, values.password, values.name!)
    .then((created) => console.info(created ? `✔ Admin ${values.email} created` : `Admin ${values.email} already exists`))
    .catch((err) => {
      console.error('Failed:', err.message ?? err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
