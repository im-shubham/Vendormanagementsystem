# RCPL Vendor POD Management System

A web application that moves Proof of Delivery (POD) handling for **Reliance Consumer Products Limited (RCPL)** off WhatsApp and email and into one system you can track. It runs entirely on **Firebase** (Blaze plan).

* **Vendor Portal**: first-time account activation, login, password reset, dashboard, POD upload, submission history, rejection remarks, re-upload with version history, and real-time in-app notifications.
* **Staff Portal** (one login page, content depends on role):
  * **Admin**: everything below, plus the vendor master, vendor registration approvals and **Team & Access** (create Category/Billing/Admin logins).
  * **Category team** (assigned to one or more of the 10 staples categories): sees only its categories' PODs, **uploads PODs on a vendor's behalf** (e.g. received on WhatsApp or email), **forwards to billing** or **sends back** for a new copy.
  * **Billing team**: sees PODs forwarded to billing (all categories), **marks them billed** or sends back.

**Categories:** Rice, Sugar, Flour, Spices, Edible Oils, Pulses, Salt, Ghee, Dry Fruits, Cereals. A vendor can supply several categories and picks one per POD.

**POD lifecycle (no approve/reject):**
```
Vendor or Category uploads ─► WITH CATEGORY TEAM ─(Forward)─► WITH BILLING ─(Mark billed)─► BILLED
                                      │                              │
                                  (Send back)                   (Send back)
                                      ▼                              ▼
                              RE-UPLOAD REQUESTED ◄──────────────────┘
                                      │  vendor OR category uploads a new copy (v2, v3…)
                                      └──────────────► WITH CATEGORY TEAM
```

> MVP scope: approval is a manual decision by an admin. OCR, AI image checks, reminders and SAP integration are deliberately left out. The code is modular so they can be added later (see [Future phases](#future-phases)).

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Lucide icons, React Router, Firebase Web SDK |
| Auth | **Firebase Authentication** (email + password); roles (`ADMIN`, `CATEGORY`, `BILLING`, `VENDOR`) are **custom claims** set only by the backend; category assignments live on the user profile |
| Database | **Cloud Firestore**, protected by `firestore.rules` |
| Files | **Cloud Storage for Firebase**, private, protected by `storage.rules` |
| Backend | **Cloud Functions for Firebase** (2nd gen, callable, Node 22, region `asia-south1`) |
| Hosting | **Firebase Hosting** (SPA) |
| Local dev | **Firebase Emulator Suite** (Auth, Firestore, Storage, Functions, Hosting) |

```
Browser (React)
  ├── Firebase Auth ───────── sign-in, password reset (email link)
  ├── Firestore (read-only) ─ security rules: role claim + live vendor approval check
  ├── Storage ─────────────── upload into OWN vendor folder only; read via rules (no public URLs)
  └── Cloud Functions ─────── every write: activation, approvals, vendor CRUD,
                              POD create/re-submit/review, submission numbers, notifications
```

**Trust model:** the browser never writes business data. Every create or update runs in a Cloud Function using the Admin SDK, after server-side validation. Role and approval status are never accepted from the client: roles come from custom claims, and approval is read from the vendor record by the rules and by the functions.

### Repository layout

```
├── firebase.json              # Hosting, Functions, rules, indexes, emulator ports
├── .firebaserc                # default project = demo-rcpl-pod (emulator); add yours with `firebase use --add`
├── firestore.rules            # Firestore security rules
├── firestore.indexes.json     # composite indexes for every query the app runs
├── storage.rules              # Storage security rules
├── storage.cors.json          # bucket CORS (needed for authenticated in-browser preview)
├── functions/                 # Cloud Functions (TypeScript)
│   ├── src/index.ts           # exports + global options (region, limits)
│   ├── src/handlers/          # activation, vendors, registrations, pods
│   ├── src/lib/               # admin SDK, guards (role checks), validation (zod),
│   │                          # file verification, notifications, search keywords, unique keys
│   ├── scripts/               # create-admin, seed-demo (Admin SDK, CLI only)
│   └── test/e2e.test.ts       # end-to-end + security test against the emulators
└── client/                    # React app
    └── src/
        ├── lib/               # firebase init, error mapping, Firestore paging helpers
        ├── services/          # authService, vendorService, adminService, notifications/documents
        ├── context/ hooks/    # AuthContext (claims + live vendor status), paging, notifications
        ├── layouts/ pages/ components/
        └── types/ utils/
```

---

## Data model (Firestore)

| Collection | Document ID | Key fields | Written by |
|---|---|---|---|
| `vendors` | auto | vendorCode (upper-case), vendorName, email (lower-case), contactPerson, mobileNumber, address, **categories**, **accountStatus** (`NOT_REGISTERED` · `PENDING_APPROVAL` · `ACTIVE` · `REJECTED` · `DEACTIVATED`), authUid, registeredAt, createdAt, updatedAt, searchKeywords | Functions |
| `userProfiles` | **Auth UID** | role (`ADMIN`/`CATEGORY`/`BILLING`/`VENDOR`), vendorId, categories, active, fullName, email, createdAt | Functions / admin script |
| `vendorRegistrationRequests` | auto | vendorId, vendor snapshot, approvalStatus, requestedAt, reviewedBy/Name/At, remarks | Functions |
| `podSubmissions` | auto (created by the client before upload) | **submissionNumber** (`POD-10001`…), vendorId, vendorName/Code, **category**, poNumber, invoiceNumber, deliveryDate (`YYYY-MM-DD`), deliveryReference, uploadedBy/Name/Role, **currentStatus** (`SUBMITTED` · `RESUBMISSION_REQUESTED` · `FORWARDED_TO_BILLING` · `BILLED`), currentVersion, **billingVisible**, lastRemarks, lastActionBy/Name/Role/At, forwardedAt, billedAt, submittedAt, updatedAt, searchKeywords | Functions |
| `podDocuments` | auto | submissionId, vendorId, documentType (`POD`/`SUPPORTING_PHOTO`), fileName, **storagePath**, contentType, size, versionNumber, uploadedBy, uploadedAt | Functions |
| `podStatusHistory` | auto | submissionId, vendorId, previousStatus, newStatus, remarks, versionNumber, updatedBy/Name/Role, updatedAt | Functions |
| `notifications` | auto | userId, title, message, link, isRead, createdAt | Functions (client may only set `isRead`) |
| `counters/podSubmissions` | fixed | next | Functions (transaction) |
| `uniqueKeys` | `vendorCode_*`, `vendorEmail_*`, `invoice_*` | enforces unique vendor code, vendor email, and one submission per invoice per vendor | Functions |

* `vendorId` is copied into documents, history and notifications so security rules can authorise each document without extra reads.
* `searchKeywords` holds lower-case prefixes, so search works with `array-contains`. Firestore has no full-text search; Algolia or Typesense can replace this later.
* Timestamps are server timestamps.

### Storage layout

```
pod-documents/{vendorId}/{submissionId}/version-{n}/pod-document.{pdf|jpg|jpeg|png}
pod-documents/{vendorId}/{submissionId}/version-{n}/supporting-photo.{jpg|jpeg|png}
```

The original file name is stored as custom metadata and in `podDocuments`. Binaries are never stored in Firestore.

---

## Key workflows

### Vendor activation (first-time login)
1. An admin creates the vendor record (`createVendor`). It starts as `NOT_REGISTERED`.
2. The vendor opens **First-Time Login / Create Password** and enters registered email + vendor code + new password.
3. `activateVendorAccount` checks that **both** match an existing `NOT_REGISTERED` vendor. Then it creates the Firebase Auth user (Firebase stores the password hash; nothing is stored in Firestore), sets claims `{role: VENDOR, vendorId}`, creates the `userProfile` and registration request, and sets the vendor to `PENDING_APPROVAL`. Duplicates are blocked by Firebase Auth's unique email and a transactional status check.
4. An admin approves or rejects (`reviewVendorRegistration`). Only `ACTIVE` vendors can read data or call vendor functions.

### POD upload
1. The form validates required fields and the file type/size in the browser.
2. The browser generates a submission document ID and uploads the file(s) to `version-1/`. Storage rules allow only the **active** vendor's own folder, only create (no overwrite or delete), only PDF/JPG/PNG, and at most 10 MB.
3. `createPodSubmission` checks the uploaded files on the server (exactly one POD, at most one photo, MIME type, size, file **signature**). It then takes the next **submission number** from a transactional counter and, in **one transaction**, writes the submission (`UNDER_REVIEW`), document metadata and status history. Invalid uploads are deleted.
4. Vendor and admins get notifications. The submission appears on the dashboard and in My Submissions.

### Review and re-upload
`reviewPodSubmission` (admin only) approves or rejects. Rejection needs remarks, and only `UNDER_REVIEW` items can be reviewed. A rejected vendor uploads to `version-{n+1}/` and calls `resubmitPodSubmission`. Earlier versions stay in place and the history records every step.

```
UNDER_REVIEW ──► APPROVED
     │
     └──► REJECTED (remarks) ──► vendor re-uploads v2, v3… ──► UNDER_REVIEW
```

`PENDING` is reserved for deliveries that are expected but have no POD yet (future SAP feed). The "Pending POD" KPI is calculated from real data and stays at 0 until that integration exists.

---

## Security summary

| Requirement | Implementation |
|---|---|
| Server-controlled roles | Custom claims (`role`, `vendorId`) are set only by Cloud Functions or the admin CLI script. Rules and functions read claims, never client input. |
| Approval cannot be bypassed | Rules call `get(vendors/{vendorId}).accountStatus == 'ACTIVE'` on every vendor read (Firestore **and** Storage). Functions check it again. Vendors cannot write vendor records at all. |
| Vendor isolation | Every operational document has `vendorId`. Rules require `vendorId == token.vendorId`. Storage paths start with the vendor ID. |
| Deactivation | Vendor set to `DEACTIVATED`, Firebase user **disabled**, refresh tokens **revoked**. Rules block existing sessions immediately. Historical PODs are kept. |
| Private documents | No public objects and no download-token URLs. Files are read with `getBlob()` under Storage rules. |
| Self-registration | Anyone can technically create a Firebase Auth user, but without claims or a profile they get no access at all (tested). See the production checklist for disabling client sign-up completely. |
| Secrets | The web config in `client/.env.local` identifies the project and is not secret. Admin SDK credentials are used only by Functions (built-in service account) and by CLI scripts through Application Default Credentials, never in the frontend. Service-account files are git-ignored. |

---

## Local development (Emulator Suite)

Requirements: Node.js 22, Java 11+ (for the Firestore and Storage emulators).

```bash
npm install                   # installs client + functions workspaces + firebase-tools

# Terminal 1 — emulators (builds functions first). Data is exported to .emulator-data on exit.
npm run emulators             # later: npm run emulators:resume  (re-imports saved data)

# Terminal 2 — demo data (admin + 4 vendor records)
npm run seed:emulator

# Terminal 3 — web app against the emulators
npm run dev:emulator          # http://localhost:5173   (Emulator UI: http://127.0.0.1:4000)
```

**Demo accounts (emulator only)**

| Portal | Credentials |
|---|---|
| Admin | `admin@rcpl.demo` / `Admin@12345` |
| Category team (Rice, Pulses) | `category.rice@rcpl.demo` / `Category@123` |
| Category team (Edible Oils, Ghee) | `category.oils@rcpl.demo` / `Category@123` |
| Billing team | `billing@rcpl.demo` / `Billing@123` |
| Vendor | Use **First-Time Login** with `abcfoods@example.com` + vendor code `V1001`, then approve it in the Admin Portal |

Other seeded vendors: `V1002 xyzagri@example.com`, `V1003 mnoexports@example.com`, `V1004 globalfoods@example.com`.
Password-reset emails are not sent in the emulator. The links appear in the Emulator UI → Authentication.

### Tests

```bash
npm test     # builds functions, starts the emulators, runs functions/test/e2e.test.ts, shuts down
```

The test uses the **real web SDK**, so the security rules apply exactly as in the browser. It also uses the real functions. It covers the 13 MVP scenarios:

1. Admin creates a vendor
2. Vendor creates a password
3. Account goes to pending approval
4. Pending vendor gets no data, uploads or function access
5. Admin approves the vendor
6. Vendor gets access
7. Vendor uploads a POD
8. Admin views and downloads it
9. Admin approves it
10. Vendor sees the approved status
11. Admin rejects another POD (remarks mandatory)
12. Vendor sees the reason and re-uploads
13. Admin reviews version 2 (version 1 and history kept)

It also checks:

* duplicate vendors and invoices are refused
* self-registered users have no access
* vendors cannot approve themselves
* cross-vendor isolation for documents and files
* Storage rules: wrong folder, wrong type, no overwrite
* server-side file validation (fake PDF, missing file, future date)
* notifications: users can only change `isRead`
* deactivation, reactivation and registration rejection
* the password-reset email-link flow

---

## Deploying to Firebase (Blaze plan)

1. **Create the project** in the [Firebase console](https://console.firebase.google.com) and upgrade to **Blaze**.
2. **Authentication** → Sign-in method → enable **Email/Password**. Under Settings, set a **password policy** (min 8, upper, lower, number, special) to match the app. Add your Hosting domain(s) to **Authorized domains**.
3. **Firestore** → create the database in **production mode**, location **`asia-south1` (Mumbai)** or your approved region.
4. **Storage** → Get started, same region. When you first deploy `storage.rules`, the CLI asks to let Storage read Firestore for the cross-service approval check. **Accept.**
5. **Web app** → Project settings → add a Web app → copy its config into `client/.env.local` (start from `client/.env.example`).
6. **CLI:**
   ```bash
   npx firebase login
   npx firebase use --add                     # select your project, alias e.g. "prod"
   cp functions/.env.example functions/.env   # APP_REGION=asia-south1 (must match VITE_FIREBASE_FUNCTIONS_REGION)
   npm run deploy                             # builds functions + client, deploys rules, indexes, functions, hosting
   ```
   Indexes can take a few minutes to build after the first deploy.
7. **Bucket CORS** (needed for in-browser previews through `getBlob`). Edit `storage.cors.json` with your domains, then:
   ```bash
   gcloud storage buckets update gs://<your-bucket> --cors-file=storage.cors.json
   ```
8. **First admin** (uses your own Google credentials. Never commit a key file.)
   ```bash
   gcloud auth application-default login
   npm run create-admin -w functions -- --project <project-id> --email admin@rcpl.com --password 'Str0ng@Pass' --name "Admin User"
   ```
9. **Password-reset emails**: Authentication → Templates → Password reset. Optionally set **Customize action URL** to `https://<your-domain>/reset-password` so users reset inside the branded portal (the default Firebase page also works). Configure a custom SMTP sender / domain for RCPL.

### Upgrading an existing project to the category/billing workflow
After deploying this version to a project that already has test data:
```bash
cd functions
# (use your service-account key via GOOGLE_APPLICATION_CREDENTIALS, as for create-admin)
npx tsx scripts/migrate-v3.ts --project <project-id> --default-category RICE --dry-run   # preview
npx tsx scripts/migrate-v3.ts --project <project-id> --default-category RICE             # apply
```
Then open **Admin → Vendors** and assign categories to every vendor, and create Category/Billing users in **Admin → Team & Access**.

### Production checklist
- [ ] Turn on **App Check** (reCAPTCHA Enterprise) and enforce it for Firestore, Storage and Functions.
- [ ] Block client-side account creation: upgrade Auth to **Identity Platform** and turn off "Enable create (sign-up)" (activation runs server-side, so nothing breaks).
- [ ] Set budget alerts on the Blaze plan.

> **Step-by-step deploy guide (laptop terminal or GitHub Actions): see [DEPLOY.md](DEPLOY.md).**
- [ ] Restrict the browser API key to your Hosting domains (Google Cloud console → Credentials).
- [ ] Confirm the region meets RCPL data-residency rules.

---

## Future phases

Not built in the MVP. Planned extension points:

* **OCR / AI / image-quality checks** (blur, crop, stamp, signature, invoice match, duplicates): add a Storage-triggered or Firestore-triggered function that writes results to a `podValidations` collection, and show them on the admin review screen. `lib/files.ts` is where uploads are checked today.
* **Automated reminders, overdue PODs, email/SMS**: scheduled functions (`onSchedule`) plus extra channels in `lib/notifications.ts`, the single place where notifications are created.
* **SAP integration**: a scheduled or HTTP function creates `PENDING` submissions from expected deliveries.
* **Reporting / Power BI / scorecards**: the Firestore → BigQuery export extension.
* **Full-text search**: Algolia or Typesense extension in place of `searchKeywords`.
