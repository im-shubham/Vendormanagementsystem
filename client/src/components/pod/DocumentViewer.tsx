import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, ImageIcon } from 'lucide-react';
import clsx from 'clsx';
import { documentService } from '@/services/commonService';
import { ApiError } from '@/services/apiClient';
import { useToast } from '@/context/ToastContext';
import { formatBytes, formatDateTime } from '@/utils/format';
import type { PodDocument } from '@/types';
import { Button } from '../ui/Button';
import { ErrorState, Spinner } from '../ui/Feedback';

/**
 * Previews POD documents. Files are fetched with the user's token and shown
 * via a temporary object URL — there are no public document links.
 */
export function DocumentViewer({ documents }: { documents: PodDocument[] }) {
  const versions = [...new Set(documents.map((d) => d.versionNumber))].sort((a, b) => b - a);
  const [version, setVersion] = useState(versions[0]);
  const forVersion = documents.filter((d) => d.versionNumber === version);
  const [selected, setSelected] = useState<PodDocument | undefined>(forVersion.find((d) => d.documentType === 'POD') ?? forVersion[0]);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const docs = documents.filter((d) => d.versionNumber === version);
    setSelected(docs.find((d) => d.documentType === 'POD') ?? docs[0]);
  }, [version, documents]);

  useEffect(() => {
    if (!selected) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUrl(null);
    documentService
      .fetch(selected.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : 'Unable to load document.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected]);

  if (!documents.length) return <p className="text-sm text-slate-500">No documents uploaded.</p>;

  const download = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      await documentService.download(selected.id, selected.fileName);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Download failed', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div>
      {versions.length > 1 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Version</span>
          {versions.map((v) => (
            <button
              key={v}
              onClick={() => setVersion(v)}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-sm font-semibold transition',
                v === version ? 'bg-navy-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              v{v}
              {v === versions[0] && <span className="ml-1 font-normal opacity-80">(latest)</span>}
            </button>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        {forVersion.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelected(d)}
            className={clsx(
              'flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition',
              selected?.id === d.id ? 'border-royal-400 bg-royal-50 text-royal-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300',
            )}
          >
            {d.fileType.startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
            <span className="min-w-0">
              <span className="block font-semibold">{d.documentType === 'POD' ? 'POD Document' : 'Supporting Photo'}</span>
              <span className="block max-w-[220px] truncate text-xs opacity-75">{d.fileName}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <div className="grid min-h-[420px] place-items-center">
          {loading && <Spinner label="Loading document…" />}
          {error && <ErrorState message={error} />}
          {url && selected && (selected.fileType === 'application/pdf' ? (
            <iframe src={url} title={selected.fileName} className="h-[70vh] min-h-[420px] w-full bg-white" />
          ) : (
            <img src={url} alt={selected.fileName} className="max-h-[70vh] w-auto object-contain p-2" />
          ))}
        </div>
      </div>

      {selected && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {selected.fileName} · {formatBytes(selected.fileSize)} · uploaded {formatDateTime(selected.uploadedAt)}
          </p>
          <div className="flex gap-2">
            {url && (
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <ExternalLink className="h-4 w-4" /> Open
              </a>
            )}
            <Button size="sm" variant="subtle" icon={<Download className="h-4 w-4" />} loading={downloading} onClick={download}>
              Download
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
