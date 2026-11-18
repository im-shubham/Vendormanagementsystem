# RCPL Vendor POD Management System

A web application that moves Proof of Delivery (POD) handling for **Reliance Consumer Products Limited (RCPL)** off WhatsApp and email and into one system you can track.

* **Vendor Portal**: first-time account activation, login, dashboard, POD upload, submission history, rejection remarks, re-upload, and in-app notifications.
* **Admin Portal**: dashboard, vendor master (create, read, update, deactivate), registration approvals, POD verification (preview, download, approve, reject with remarks).

> MVP scope: approval is a manual decision by an admin. OCR, AI validation, SAP, email and reporting integrations are deliberately left out. The code is modular so they can be added later (see [Future enhancements](#future-enhancements)).

---

## Tech stack

| Layer    | Technology |
|----------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Lucide icons, React Router |
| Backend  | Node.js, Express 5, TypeScript, Zod validation, Multer |
| Database | Supabase PostgreSQL (plain PostgreSQL 14+ also works for local development) |
| Auth     | Supabase Auth (`AUTH_PROVIDER=supabase`), or a built-in bcrypt + JWT provider for local development (`AUTH_PROVIDER=local`) |
| Storage  | Supabase Storage, private bucket (`STORAGE_PROVIDER=supabase`), or local disk for development |

## Project structure

```
├── supabase/
│   ├── migrations/            # SQL schema, RLS policies, grants (run in order)
│   └── local/                 # Shim for plain PostgreSQL (auth schema, roles) — local dev only
├── server/                    # Express API
│   └── src/
│       ├── auth/              # AuthProvider interface + Supabase / local implementations
│       ├── storage/           # StorageProvider interface + Supabase / local implementations
│       ├── config/            # Validated environment configuration
│       ├── db/                # pg pool, withUser (RLS context) / withSystem helpers
│       ├── middleware/        # authenticate, requireAdmin, requireActiveVendor, upload, errors
│       ├── routes/            # auth, vendor, admin, common (documents, notifications)
│       ├── services/          # business logic (auth, vendor master, POD, notifications)
│       ├── utils/             # validation schemas, SQL helpers, HTTP errors
│       └── scripts/           # migrate, seed-demo, create-admin, e2e-test
└── client/                    # React app
    └── src/
        ├── components/        # ui/, brand/, dashboard/, pod/, layout/
        ├── context/           # AuthContext, ToastContext
        ├── hooks/             # useAsync, useDebounce, useNotifications
        ├── layouts/           # AuthLayout, PortalLayout (sidebar + top bar)
        ├── pages/             # auth/, vendor/, admin/
        ├── services/          # API client + typed service modules
        ├── types/             # shared TypeScript types
        └── utils/             # formatting, constants
```

---

## Quick start (local, no Supabase account needed)

Requirements: Node.js 20+, PostgreSQL 14+.

```bash
# 1. Install dependencies (npm workspaces)
npm install

# 2. Create a database
createdb rcpl_pod            # or: psql -c 'create database rcpl_pod'

# 3. Configure the API
cp server/.env.example server/.env
#   - set DATABASE_URL
#   - set LOCAL_JWT_SECRET to a long random string (e.g. `openssl rand -hex 32`)

# 4. Create the schema and demo data
npm run db:migrate
npm run db:seed

# 5. Run the API (port 4000) and the web app (port 5173)
npm run dev
```

Open <http://localhost:5173>.

### Demo accounts

| Portal | Login | Notes |
|--------|-------|-------|
| Admin  | `admin@rcpl.demo` / `Admin@12345` | Created by `db:seed` (demo only) |
| Vendor | `abcfoods@example.com` + vendor code `V1001` | Use **First-Time Login / Create Password**, then approve the request from the Admin Portal |

Other seeded vendors: `V1002 xyzagri@example.com`, `V1003 mnoexports@example.com`, `V1004 globalfoods@example.com`.

In local auth mode no emails are sent. **Forgot Password** prints the reset link in the API console.

---

## Deploying with Supabase

1. Create a Supabase project.
2. In `server/.env`:
   ```env
   DATABASE_URL=postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
   DATABASE_SSL=true
   AUTH_PROVIDER=supabase
   STORAGE_PROVIDER=supabase
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server only, never in the frontend
   APP_URL=https://<your frontend domain>
   CORS_ORIGINS=https://<your frontend domain>
   ```
   Use the direct connection or the **session** pooler (port 5432).
3. `npm run db:migrate` applies `supabase/migrations/*.sql`. You can also paste them into the SQL editor in order.
4. Create the first admin:
   ```bash
   npm run create-admin -- --email admin@rcpl.com --password 'Str0ng@Pass' --name "Admin User"
   ```
5. Supabase dashboard → Authentication → URL Configuration: add `https://<frontend>/reset-password` as a redirect URL. Configure SMTP so password-reset emails come from an RCPL domain.
6. The API creates the private bucket `pod-documents` on startup if it doesn't exist.
7. Build: `npm run build`. Serve `client/dist` as static files with an SPA fallback to `index.html`, and run `node server/dist/index.js`. If the API is on another domain, set `VITE_API_URL` at build time.

> Only the backend talks to Supabase. The frontend has **no Supabase keys at all**: no anon key and no service key.

---

## Security model

| Concern | How it's handled |
|---|---|
| No shared/default vendor passwords | Each vendor creates their own password through first-time activation. Supabase Auth or bcrypt stores it. |
| Arbitrary self-registration | Activation needs an existing vendor-master record with a matching **email and vendor code**, in `NOT_REGISTERED` status. |
| Bypassing admin approval | 1) Login gives no tokens unless the vendor is `ACTIVE`. 2) Every vendor API request re-checks status (deactivation applies immediately). 3) In the database, `current_vendor_id()` returns NULL unless the vendor is `ACTIVE`, so RLS hides all data. |
| Vendors seeing other vendors' data | Postgres **Row Level Security**. The API runs every user request as the `authenticated` role with the caller's JWT `sub`, the same way Supabase PostgREST does, so the database enforces the policies, not only the API. |
| Invalid status changes | The `pod_submissions` trigger allows only `UNDER_REVIEW → APPROVED/REJECTED` and `REJECTED → UNDER_REVIEW`, requires rejection remarks, and stops vendors editing review fields or admins editing vendor data. |
| File access | Private storage. Files are streamed only through `GET /api/documents/:id/file` after an RLS-checked lookup. There are no public URLs. |
| File validation | PDF/JPG/JPEG/PNG only, 10 MB limit, extension + MIME type + magic-byte signature check. |
| Version history | Re-uploads add new `pod_documents` versions. Nothing is overwritten (`flag: 'wx'` / `upsert: false`). |
| Brute force | Rate limiting on login, activation and password-reset endpoints. |
| Secrets | The service-role key is used only by the server. `.env` files are git-ignored. |

## POD status workflow

```
Vendor uploads ──► UNDER_REVIEW ──► APPROVED
                        │
                        └──► REJECTED (mandatory remarks) ──► vendor re-uploads (v2, v3…) ──► UNDER_REVIEW
```

Every transition is written to `pod_status_history`. Vendors get an in-app notification on submission, approval and rejection (with the remarks). Admins are notified of new registrations, submissions and re-uploads.

`PENDING` exists in the status enum for future expected deliveries without a POD (e.g. from a SAP delivery feed). The "Pending POD" KPI is calculated from real data and stays at 0 until that integration exists.

## Database

Tables: `vendors`, `user_profiles`, `vendor_registration_requests`, `pod_submissions`, `pod_documents`, `pod_status_history`, `notifications`. All have foreign keys, check constraints and indexes. RLS is enabled on every table.
Notable constraints: unique vendor code/email (case-insensitive), one open registration request per vendor, one submission per invoice per vendor, unique document version per submission.

## API overview

| Method & path | Who |
|---|---|
| `POST /api/auth/login` · `/activate` · `/refresh` · `/forgot-password` · `/reset-password` · `GET /me` · `POST /logout` | public / authenticated |
| `GET /api/vendor/dashboard` · `GET/POST /api/vendor/submissions` · `GET /api/vendor/submissions/:id` · `POST /api/vendor/submissions/:id/reupload` | active vendor |
| `GET /api/admin/dashboard` · `GET/POST /api/admin/vendors` · `GET/PUT /api/admin/vendors/:id` · `POST …/deactivate` · `POST …/reactivate` | admin |
| `GET /api/admin/registrations` · `POST /api/admin/registrations/:id/approve` · `…/reject` | admin |
| `GET /api/admin/submissions` · `GET /api/admin/submissions/:id` · `POST …/approve` · `POST …/reject` | admin |
| `GET /api/documents/:id/file[?download=1]` · `GET /api/notifications` · `POST /api/notifications/:id/read` · `/read-all` | admin or active vendor |

## Testing

`npm run test:e2e` runs the whole workflow through the real HTTP API against the configured database and storage. It uses unique vendors on each run, so it's safe to repeat (it needs the seeded demo admin, or set `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`):

1. Admin creates a vendor
2. Vendor creates a password
3. Account goes to pending approval
4. Vendor cannot access the dashboard before approval (API **and** direct DB/RLS checks)
5. Admin approves the vendor
6. Vendor logs in (email or vendor code)
7. Vendor uploads a POD
8. Admin views and downloads the POD
9. Admin approves it
10. Vendor sees the approved status
11. Admin rejects another POD with remarks
12. Vendor sees the reason and re-uploads
13. Admin reviews the new version (old version and history kept)

It also checks cross-vendor isolation, admin-route protection, upload validation (type, fake files, future dates, duplicate invoices), deactivation and reactivation, registration rejection, and the password-reset flow.

## Future enhancements

Not built in this phase. Planned extension points:

* **AI / OCR validation** (blur, crop, stamp, signature, invoice/date matching, duplicates): add a validation step in `services/pod.service.ts` after `validateFiles`, ideally as an async job that writes results to a new `pod_validation_results` table.
* **Email / SMS notifications, reminders, overdue alerts**: extend `services/notification.service.ts` (the single place notifications are created).
* **RCPL-approved storage** (Azure Blob, S3, on-prem DMS): implement `storage/provider.ts`.
* **Corporate SSO**: implement `auth/provider.ts`.
* **SAP delivery feed**: create `PENDING` submissions from expected deliveries.
* **Power BI / vendor scorecards**: read from the normalised tables and status history.
