import { logger } from 'firebase-functions';
import { COL, FieldValue, db } from './admin';
import { CATEGORY_LABELS, type Category } from './constants';

/**
 * Single place where every notification is created.
 *
 *  • In-app notification  → `notifications` collection (shown in the bell, realtime)
 *  • Email                → `mail` collection, delivered by the Firebase
 *                           "Trigger Email from Firestore" extension (SMTP).
 *                           If the extension is not installed yet, mail
 *                           documents simply wait — nothing breaks.
 *
 * Audiences are resolved here (admins, category teams, billing, vendor), the
 * person who performed the action is excluded, and each person gets at most
 * one notification per event. Failures are logged and never undo a completed
 * business action. (Future: SMS / WhatsApp channels plug in here.)
 */

export interface Audience {
  admins?: boolean;
  categories?: Category[];
  billing?: boolean;
  /** Vendor's portal login; falls back to the vendor-master email (email only) when the vendor has no login yet. */
  vendorId?: string;
}

export interface Notice {
  title: string;
  message: string;
  /** In-app route, e.g. /admin/submissions/abc — also used for the email button. */
  link?: string | null;
  /** Separate route for vendor recipients (vendor portal paths differ). */
  vendorLink?: string | null;
}

interface Recipient {
  uid: string | null; // null = email-only (vendor without a login)
  email: string | null;
  isVendor: boolean;
}

const EMAIL_ENABLED = process.env.EMAIL_ENABLED !== 'false';
const appUrl = () => (process.env.APP_URL || `https://${process.env.GCLOUD_PROJECT || 'rcpl-pod-prod'}.web.app`).replace(/\/$/, '');

async function resolve(a: Audience): Promise<Recipient[]> {
  const out = new Map<string, Recipient>();
  const add = (r: Recipient) => out.set(r.uid ?? `email:${r.email}`, r);
  const staffQueries: Promise<void>[] = [];

  const staff = (role: string, filter?: (d: FirebaseFirestore.QueryDocumentSnapshot) => boolean) =>
    db
      .collection(COL.userProfiles)
      .where('role', '==', role)
      .get()
      .then((s) =>
        s.docs
          .filter((d) => d.get('active') !== false && (!filter || filter(d)))
          .forEach((d) => add({ uid: d.id, email: d.get('email') ?? null, isVendor: false })),
      );

  if (a.admins) staffQueries.push(staff('ADMIN'));
  if (a.billing) staffQueries.push(staff('BILLING'));
  if (a.categories?.length) {
    // Filtered in code (no composite index needed; staff lists are small).
    staffQueries.push(staff('CATEGORY', (d) => ((d.get('categories') as string[]) ?? []).some((c) => a.categories!.includes(c as Category))));
  }
  if (a.vendorId) {
    staffQueries.push(
      (async () => {
        const logins = await db.collection(COL.userProfiles).where('vendorId', '==', a.vendorId).get();
        const vendorLogins = logins.docs.filter((d) => d.get('role') === 'VENDOR');
        if (vendorLogins.length) {
          vendorLogins.forEach((d) => add({ uid: d.id, email: d.get('email') ?? null, isVendor: true }));
        } else {
          const v = await db.collection(COL.vendors).doc(a.vendorId!).get();
          if (v.exists && v.get('accountStatus') !== 'DEACTIVATED') add({ uid: null, email: v.get('email') ?? null, isVendor: true });
        }
      })(),
    );
  }
  await Promise.all(staffQueries);
  return [...out.values()];
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function emailHtml(title: string, message: string, url: string | null) {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#0f1f5a;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:700">RCPL Vendor POD Portal<div style="height:3px;width:44px;background:#e31b23;margin-top:8px;border-radius:2px"></div></td></tr>
<tr><td style="padding:24px">
<h2 style="margin:0 0 10px;font-size:20px;color:#0f1f5a">${escape(title)}</h2>
<p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:#334155">${escape(message)}</p>
${url ? `<a href="${url}" style="display:inline-block;background:#162d84;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Open in portal</a>` : ''}
</td></tr>
<tr><td style="padding:14px 24px;background:#f8fafc;color:#64748b;font-size:12px">Reliance Consumer Products Limited · This is an automated message from the Vendor POD Portal.</td></tr>
</table></td></tr></table></body></html>`;
}

/** Send in-app notifications (+ email) to an audience, excluding the actor. */
export async function notify(audience: Audience, n: Notice, opts: { exceptUid?: string; email?: boolean } = {}) {
  try {
    const recipients = (await resolve(audience)).filter((r) => !opts.exceptUid || r.uid !== opts.exceptUid);
    if (!recipients.length) return;
    const batch = db.batch();
    const now = FieldValue.serverTimestamp();
    const sendEmail = EMAIL_ENABLED && opts.email !== false;
    for (const r of recipients) {
      const link = r.isVendor ? (n.vendorLink ?? n.link ?? null) : (n.link ?? null);
      if (r.uid) {
        batch.create(db.collection(COL.notifications).doc(), { userId: r.uid, title: n.title, message: n.message, link, isRead: false, createdAt: now });
      }
      if (sendEmail && r.email) {
        const url = link ? `${appUrl()}${link}` : appUrl();
        batch.create(db.collection(COL.mail).doc(), {
          to: [r.email],
          message: { subject: `RCPL POD Portal: ${n.title}`, text: `${n.message}\n\n${url}`, html: emailHtml(n.title, n.message, url) },
          createdAt: now,
        });
      }
    }
    await batch.commit();
  } catch (err) {
    logger.error('notify failed', err);
  }
}

/** Direct email to an address (e.g. vendor activation invite). */
export async function sendEmail(to: string, subject: string, title: string, message: string, link: string | null) {
  if (!EMAIL_ENABLED) return;
  try {
    const url = link ? `${appUrl()}${link}` : appUrl();
    await db.collection(COL.mail).add({
      to: [to],
      message: { subject: `RCPL POD Portal: ${subject}`, text: `${message}\n\n${url}`, html: emailHtml(title, message, url) },
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error('sendEmail failed', err);
  }
}

export const categoryText = (cats: Category[]) => cats.map((c) => CATEGORY_LABELS[c]).join(', ');

// ---- Back-compat helpers (in-app + email) ----------------------------------
export const notifyVendor = (vendorId: string, n: Omit<Notice, 'vendorLink'>, exceptUid?: string) => notify({ vendorId }, { ...n, vendorLink: n.link }, { exceptUid });
export const notifyCategory = (category: Category, n: Notice, exceptUid?: string) => notify({ categories: [category] }, n, { exceptUid });
export const notifyBilling = (n: Notice, exceptUid?: string) => notify({ billing: true }, n, { exceptUid });
export const notifyAdmins = (n: Notice, exceptUid?: string) => notify({ admins: true }, n, { exceptUid });
