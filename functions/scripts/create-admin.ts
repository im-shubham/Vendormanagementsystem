/**
 * Create an RCPL admin (sets the server-controlled ADMIN custom claim).
 *
 *   npm run create-admin -w functions -- --project <id> --email admin@rcpl.com --password 'Str0ng@Pass' --name "Admin User"
 *   npm run create-admin -w functions -- --emulator --email ... --password ...
 */
import { initAdmin } from './_init';

const args = initAdmin();

(async () => {
  const { createAdmin } = await import('./admin-users');
  if (!args.email) throw new Error('--email is required');
  const r = await createAdmin(String(args.email), args.password ? String(args.password) : undefined, String(args.name ?? 'RCPL Admin'));
  console.info(r.created ? `✔ Admin ${args.email} created` : `✔ ${args.email} granted admin role`);
  console.info('  (An already signed-in user must sign out and back in to pick up the role.)');
})().catch((err) => {
  console.error('Failed:', err.message ?? err);
  process.exit(1);
});
