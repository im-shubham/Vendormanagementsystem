import { Mail, Phone } from 'lucide-react';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { GuidelinesCard } from '@/components/dashboard/GuidelinesCard';
import { SUPPORT_EMAIL } from '@/utils/constants';

const FAQ = [
  ['Which file formats can I upload?', 'PDF, JPG, JPEG and PNG files up to 10 MB. Combine multi-page PODs into a single PDF where possible.'],
  ['What happens after I upload?', 'Your POD goes to the RCPL category team (e.g. Rice, Sugar). They forward it to the billing team, and you can follow every step in My Submissions.'],
  ['RCPL asked for a new copy. What should I do?', 'Open the submission, read the reason and use "Upload New Copy". Previous versions are kept for audit.'],
  ['Can I submit the same invoice twice?', 'No. Each invoice can only be submitted once. If a POD was sent back, upload the new copy against the same submission.'],
  ['I sent the POD on WhatsApp / email. Do I upload again?', 'Not necessarily — the category team can upload it for you, and it will appear in your portal.'],
  ['I forgot my password.', 'Use "Forgot Password" on the login page to receive a reset link on your registered email.'],
];

export default function HelpPage() {
  return (
    <div>
      <PageHeader title="Help & Support" subtitle="Answers to common questions and how to reach the RCPL vendor team." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="Frequently asked questions" />
          <div className="divide-y divide-slate-100 px-5 pb-3 sm:px-6">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-slate-800">
                  {q}
                  <span className="text-xl text-slate-400 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact RCPL" />
            <div className="space-y-3 p-5 sm:p-6">
              <a href={`mailto:${SUPPORT_EMAIL}`} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:border-royal-300 hover:bg-royal-50/50">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-royal-50 text-royal-700"><Mail className="h-5 w-5" /></span>
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Email vendor support</span>
                  <span className="block text-sm text-slate-500">{SUPPORT_EMAIL}</span>
                </span>
              </a>
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-royal-50 text-royal-700"><Phone className="h-5 w-5" /></span>
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Your RCPL buyer / plant contact</span>
                  <span className="block text-sm text-slate-500">For delivery-specific queries</span>
                </span>
              </div>
            </div>
          </Card>
          <GuidelinesCard compact />
        </div>
      </div>
    </div>
  );
}
