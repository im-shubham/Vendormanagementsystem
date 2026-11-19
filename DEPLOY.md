# Deploying the RCPL Vendor POD Portal to Firebase

Two ways to deploy:

* **Option A** – from your laptop terminal (VS Code). No GitHub needed.
* **Option B** – automatically from GitHub Actions on every push to `main`.

Both need the same one-time **console setup** (Part 1). Only the project owner can do it, because it involves your Google login and billing.

---

## Part 1 – One-time setup in the Firebase console (about 10 minutes)

1. Open <https://console.firebase.google.com> → **Add project** → name it, e.g. `rcpl-pod-prod`. Google Analytics is optional.
   Note the **Project ID** shown under the name. You'll need it below.
2. Bottom-left **Spark → Upgrade** → choose **Blaze** and attach the billing account.
   Then **Usage and billing → Details & settings → Budget alerts** and set an alert, e.g. ₹2,000/month.
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
   Under **Settings → Password policy**, require: min 8, uppercase, lowercase, number, special character.
4. **Build → Firestore Database → Create database** → *Production mode* → location **asia-south1 (Mumbai)** (or your approved region; it cannot be changed later).
5. **Build → Storage → Get started** → *Production mode* → same location.
6. **Project settings (⚙) → General → Your apps → Web (`</>`)** → register an app, e.g. "RCPL POD Portal", and tick **Also set up Firebase Hosting**.
   Copy the `firebaseConfig` values. You'll need them below.

---

## Part 2 – Option A: deploy from your laptop terminal

### Prerequisites (one time)
* **Node.js 22 LTS** – <https://nodejs.org> (check with `node -v`)
* **Google Cloud CLI** – <https://cloud.google.com/sdk/docs/install> (needed for bucket CORS and the first admin)
* **Java 17+** – only needed to run the local emulators/tests (<https://adoptium.net>)

### Steps (VS Code → Terminal → New Terminal, inside the unzipped folder)

```bash
# 1. Install dependencies
npm install

# 2. Web app configuration
#    Copy client/.env.example to client/.env.local and fill in the values from Part 1 step 6
#    (Windows PowerShell:  Copy-Item client\.env.example client\.env.local)

# 3. Functions configuration
#    Copy functions/.env.example to functions/.env   (contains APP_REGION=asia-south1)

# 4. Log in and select your project
npx firebase login
npx firebase use --add          # pick your project, alias: prod

# 5. Build and deploy everything (rules, indexes, functions, hosting)
npm run deploy
```

When `storage.rules` is first deployed, the CLI asks to let Storage read Firestore (used for the vendor-approval check). Answer **Yes**.
At the end the CLI prints your site URL: `https://<project-id>.web.app`.

```bash
# 6. Allow the browser to preview documents (bucket CORS)
#    Edit storage.cors.json: replace YOUR-PROJECT-ID with your project ID, then:
gcloud auth login
gcloud storage buckets update gs://<your-bucket> --cors-file=storage.cors.json
#    <your-bucket> = VITE_FIREBASE_STORAGE_BUCKET value, e.g. rcpl-pod-prod.firebasestorage.app

# 7. Create the first admin login (uses your Google login; no key files)
gcloud auth application-default login
npm run create-admin -w functions -- --project <project-id> --email you@rcpl.com --password "Str0ng@Pass1" --name "Your Name"
```

8. Open `https://<project-id>.web.app/admin/login` and sign in.
   Add your first vendor, then the vendor uses **First-Time Login** at `https://<project-id>.web.app/login`.

> Composite indexes take a few minutes to build after the first deploy. If a list shows "index is still being created", wait and refresh.

### Optional – try it locally first (no cloud, no billing)

```bash
npm run emulators            # terminal 1 (needs Java)
npm run seed:emulator        # terminal 2
npm run dev:emulator         # terminal 3 → http://localhost:5173
npm test                     # full automated test suite (stop terminal 1 first)
```

Demo logins (emulator only): admin `admin@rcpl.demo` / `Admin@12345`. For a vendor, use First-Time Login with `abcfoods@example.com` + `V1001`.

### Corporate network notes
* If `npm install` or `firebase login` fails behind the office proxy, set `HTTPS_PROXY`/`HTTP_PROXY` (and `npm config set proxy …`), or use a personal network for the one-time setup.
* `npx firebase login --no-localhost` works when the browser callback is blocked.

---

## Part 3 – Option B: automatic deploys from GitHub Actions

The workflow `.github/workflows/firebase-deploy.yml` runs typecheck and the emulator tests on every push and pull request. On push to `main`, or a manual **Run workflow**, it deploys everything.

### 1. Create a deploy-only service account (Google Cloud console)
<https://console.cloud.google.com/iam-admin/serviceaccounts?project=YOUR-PROJECT-ID> → **Create service account** → name `github-deployer` → grant these roles:

| Role | Why |
|---|---|
| Firebase Admin | rules, indexes, hosting |
| Cloud Functions Admin | deploy functions |
| Cloud Run Admin | 2nd-gen functions run on Cloud Run |
| Service Account User | deploy functions as the runtime account |
| Artifact Registry Administrator | function images and cleanup policy |
| Cloud Build Editor | function builds |
| Service Usage Consumer | enable required APIs |

Then **Keys → Add key → JSON**. Keep the file safe. Never commit it or paste it into chat.

### 2. Add it to GitHub
Repository → **Settings → Secrets and variables → Actions**:

* **Secrets** tab → `FIREBASE_SERVICE_ACCOUNT` = full contents of the JSON key file
* **Variables** tab:
  `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, and optionally `VITE_SUPPORT_EMAIL` and `FUNCTIONS_REGION`
* **Environments** → create `production`. Optionally add required reviewers so each deploy needs approval.

### 3. Deploy
Merge to `main`, or open **Actions → Test & Deploy (Firebase) → Run workflow**.
Bucket CORS and the first admin (Part 2, steps 6–7) are still one-time manual steps.

After the first deploy, delete the downloaded key file from your computer. You can rotate the key at any time in the service-account page.

---

## Part 4 – Account emails sent by Firebase (no setup needed, optional branding)

**Activation / "set your password" emails are sent by Firebase Authentication itself**, from `noreply@<project-id>.firebaseapp.com`. They work with no mailbox and no extension:

* **Admin adds a vendor** → Firebase emails the vendor a link → the vendor sets a password and logs in → an approval request goes to Admin + the category team.
* **Admin adds a team member** (Category / Billing / Admin) → Firebase emails a "set your password" link.
* **Forgot Password** uses the same email.
* **Resend**: Vendors → vendor page → **Resend password email**; Team & Access → ✉ icon.

### Brand the email (5 minutes)
Firebase console → **Authentication → Templates** tab → **Password reset** → ✏️ edit:

| Field | Suggested value |
|---|---|
| Sender name | `RCPL Vendor POD Portal` |
| Reply-to | your team's email address |
| Subject | `Set your password – RCPL Vendor POD Portal` |
| Message | see below (keep `%LINK%`) |

```
<p>Hello %DISPLAY_NAME%,</p>
<p>Use the link below to set your password for the <b>RCPL Vendor POD Portal</b>
(Reliance Consumer Products Limited). This works for new accounts and for password resets.</p>
<p><a href='%LINK%'>Set my password</a></p>
<p>Your login email: %EMAIL%</p>
<p>New vendors: after you set your password and log in, RCPL will approve your account.</p>
<p>If you did not expect this email, you can ignore it.</p>
<p>Thanks,<br>RCPL Vendor Team</p>
```

Then click **Customize action URL** (bottom of the template) and set `https://<project-id>.web.app/reset-password`, so people set their password on the branded RCPL page. Deploy the website first with `npm run deploy`. Without this step, Firebase's own simple page is used, which also works.

**Not receiving it?** Check **Junk / Spam / Quarantine** first. Corporate Outlook often filters `firebaseapp.com`. Try a Gmail address to confirm it is being sent. To improve delivery to company inboxes: Templates → **Customize domain** → send from your own domain (e.g. `noreply@pod.rcpl.example`). IT adds the DNS records Firebase shows.

### Company mailbox (e.g. @ril.com) receives nothing, not even in Junk?
Gmail receiving the email proves Firebase is sending it. The company mail gateway is blocking or quarantining it before delivery, so it never reaches Junk.

**Immediate workaround (no IT needed):** use **🔗 Copy password setup link**, on **Team & Access** (per user) or on the **vendor page**. Share the link with that person on Teams or WhatsApp. It is the same secure link as in the email, works once and expires in about 1 hour.

**Permanent fix (pick one, with RCPL IT):**
1. **Send Firebase emails through the company mail server (best).** Firebase console → Authentication → Templates → **SMTP settings** → enable, and enter a company mailbox (e.g. `pod.portal@<company domain>`), host `smtp.office365.com`, port `587`, security `STARTTLS`, username and password. IT must enable **SMTP AUTH** for that mailbox. Emails then come from inside the company, so they are not blocked.
2. **Allow-list the sender.** Ask IT to run a **message trace** for sender `noreply@rcpl-pod-prod.firebaseapp.com`, release it from quarantine, and allow-list it.
3. **Custom sender domain.** Templates → **Customize domain**, then IT adds the DNS records Firebase shows.

Text you can send IT:
> Our internal RCPL Vendor POD Portal (Google Firebase) sends account emails ("Set your password – RCPL Vendor POD Portal") from noreply@rcpl-pod-prod.firebaseapp.com. They reach Gmail but are not delivered to @ril.com mailboxes, not even Junk. Could you please check the message trace / quarantine and allow-list this sender, **or** provide an SMTP mailbox (smtp.office365.com:587 with SMTP AUTH enabled) that we can configure in Firebase so the emails are sent from our own domain?

---

## Part 5 – Event email notifications (optional, about 10 minutes)

POD events (new POD, forwarded to billing, sent back, billed, approval requests) always appear as **in-app notifications**. To also send them **by email**, connect a mailbox once with the extension below. Firebase Authentication can only send account emails, not these.

The portal queues every email in the Firestore collection **`mail`**. Firebase's official **Trigger Email from Firestore** extension picks them up and sends them through your SMTP mailbox. Until the extension is installed, emails just wait in that collection. In-app notifications work either way.

**Who gets what**

| Event | In-app + email to |
|---|---|
| Vendor added (by Admin or Category team) | Vendor: Firebase "set your password" email (Part 4) · in-app note to Admins + that category team |
| Vendor completes First-Time Login | Admins + category team(s) of the vendor: approval request |
| Registration approved / rejected | Vendor |
| Vendor uploads a POD | Category team of that category + all Admins (vendor gets a confirmation) |
| Category team uploads on a vendor's behalf | Vendor + Admins (+ Billing if "forward now") |
| New copy uploaded after send-back | Category team + Admins |
| Forwarded to billing | Billing team + all Admins (vendor in-app) |
| Sent back | Vendor + category team + Admins |
| Marked billed | Category team + Admins + vendor |

The person who did the action is never notified about it.

**1. Choose a sender mailbox.** Options:
* **RCPL / office mailbox**: ask IT for SMTP details (host, port, username, password, or an SMTP relay). Microsoft 365 is usually `smtp.office365.com`, port 587, and SMTP AUTH must be enabled for that mailbox.
* **Gmail (quick for testing)**: turn on 2-Step Verification, then create an **App Password** at <https://myaccount.google.com/apppasswords>.
* **Email service** (SendGrid, Brevo, Mailgun): use the SMTP credentials they give you.

**2. Install the extension.** Firebase console → **Build → Extensions** (or <https://extensions.dev/extensions/firebase/firestore-send-email>) → **Trigger Email from Firestore** → **Install** → choose `rcpl-pod-prod`. Settings:

| Setting | Value |
|---|---|
| Firestore Instance ID | `(default)` |
| Firestore Instance Location | `asia-south1` |
| Authentication Type | Username & Password |
| SMTP connection URI | Gmail: `smtps://your.name@gmail.com@smtp.gmail.com:465` · Office 365: `smtp://pod.portal@yourcompany.com@smtp.office365.com:587` |
| SMTP password | the App Password / mailbox password (stored securely in Secret Manager) |
| Email documents collection | `mail` |
| Default FROM address | `RCPL POD Portal <the sender address>` |
| Default REPLY-TO address | your team's address (optional) |
| Users collection / Templates collection | leave empty |

Installing takes 3–5 minutes.

**3. Check it works.** Upload a POD, then open Firestore → `mail`. Each email document gets a `delivery.state` field: `SUCCESS` means it was sent, and `ERROR` shows the SMTP error message.

**4. Links in emails** point to `APP_URL` in `functions/.env` (default `https://<project-id>.web.app`). Deploy the website (`npm run deploy`) so those links work. To pause email, set `EMAIL_ENABLED=false` in `functions/.env` and redeploy the functions.
