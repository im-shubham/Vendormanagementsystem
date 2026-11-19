import { useEffect, useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Alert, Spinner } from './Feedback';
import { adminService } from '@/services/adminService';
import { AppError } from '@/lib/errors';

/**
 * Shows a one-time "set your password" link to share directly (Teams /
 * WhatsApp) when the Firebase email is blocked by a company mail gateway.
 */
export function SetupLinkDialog({ target, onClose }: { target: { kind: 'STAFF' | 'VENDOR'; id: string; name: string } | null; onClose: () => void }) {
  const [link, setLink] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!target) return;
    setLink(null);
    setError(null);
    setCopied(false);
    adminService
      .generateSetupLink(target.kind, target.id)
      .then((r) => {
        setLink(r.link);
        setEmail(r.email);
      })
      .catch((e) => setError(e instanceof AppError ? e.message : 'Could not create the link.'));
    // Create the link once per person (the target object may be re-created on each render).
  }, [target?.kind, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.getElementById('setup-link') as HTMLInputElement | null;
      el?.select();
      document.execCommand('copy');
    }
    setCopied(true);
  };

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Password setup link"
      description={target ? `For ${target.name}${email ? ` (${email})` : ''}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={copy} disabled={!link} icon={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        {!link && !error && <Spinner className="py-6" label="Creating secure link…" />}
        {link && (
          <>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <Link2 className="ml-1 h-4 w-4 shrink-0 text-slate-400" />
              <input id="setup-link" readOnly value={link} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none" aria-label="Setup link" />
            </div>
            <Alert kind="warning">
              Share this link <b>only with this person</b> (e.g. Teams or WhatsApp). It lets them set their own password, works <b>once</b> and expires in about <b>1 hour</b>. Create a new one if it expires.
            </Alert>
            <p className="text-sm text-slate-500">
              {target?.kind === 'VENDOR'
                ? 'After setting the password, the vendor logs in and the approval request comes to you.'
                : 'After setting the password, they log in at the Staff Login page.'}
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
