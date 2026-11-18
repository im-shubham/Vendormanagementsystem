import 'dotenv/config';
import { z } from 'zod';

const schema = z
  .object({
    PORT: z.coerce.number().default(4000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    APP_URL: z.string().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_SSL: z
      .string()
      .default('false')
      .transform((v) => v === 'true'),
    AUTH_PROVIDER: z.enum(['supabase', 'local']).default('local'),
    LOCAL_JWT_SECRET: z.string().optional(),
    STORAGE_PROVIDER: z.enum(['supabase', 'local']).default('local'),
    LOCAL_STORAGE_DIR: z.string().default('./uploads'),
    SUPABASE_STORAGE_BUCKET: z.string().default('pod-documents'),
    MAX_UPLOAD_MB: z.coerce.number().positive().default(10),
    SUPABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_PROVIDER === 'local' && (!env.LOCAL_JWT_SECRET || env.LOCAL_JWT_SECRET.length < 24)) {
      ctx.addIssue({ code: 'custom', path: ['LOCAL_JWT_SECRET'], message: 'LOCAL_JWT_SECRET (24+ chars) is required when AUTH_PROVIDER=local' });
    }
    const needsSupabase = env.AUTH_PROVIDER === 'supabase' || env.STORAGE_PROVIDER === 'supabase';
    if (needsSupabase && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
      ctx.addIssue({ code: 'custom', path: ['SUPABASE_URL'], message: 'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the supabase providers' });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid server configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const MAX_UPLOAD_BYTES = Math.round(env.MAX_UPLOAD_MB * 1024 * 1024);
