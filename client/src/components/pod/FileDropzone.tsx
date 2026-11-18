import { useEffect, useId, useRef, useState, type DragEvent } from 'react';
import { FileText, ImageIcon, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import clsx from 'clsx';
import { formatBytes } from '@/utils/format';
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB } from '@/utils/constants';

interface Props {
  label: string;
  file: File | null;
  onChange: (file: File | null) => void;
  accept: Record<string, string[]>;
  required?: boolean;
  error?: string;
  hint?: string;
}

/** Validates type/size client-side (the API re-validates, incl. file signature). */
export function validateFile(file: File, accept: Record<string, string[]>): string | null {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
  const exts = Object.values(accept).flat();
  if (!exts.includes(ext) || (file.type && !accept[file.type])) {
    return `"${file.name}" is not an accepted format. Use ${exts.map((e) => e.slice(1).toUpperCase()).join(', ')}.`;
  }
  if (file.size === 0) return 'The selected file is empty.';
  if (file.size > MAX_UPLOAD_BYTES) return `File is ${formatBytes(file.size)}. Maximum allowed size is ${MAX_UPLOAD_MB} MB.`;
  return null;
}

export function FileDropzone({ label, file, onChange, accept, required, error, hint }: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const formats = [...new Set(Object.values(accept).flat().map((e) => e.slice(1).toUpperCase()))].join(', ');

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    const err = validateFile(f, accept);
    setLocalError(err);
    if (!err) onChange(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const shownError = localError ?? error;
  const isImage = file?.type.startsWith('image/');

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required ? <span className="ml-0.5 text-brand-red">*</span> : <span className="ml-1.5 text-xs font-normal text-slate-400">(optional)</span>}
      </label>
      <input
        ref={input}
        id={id}
        type="file"
        className="sr-only"
        accept={Object.entries(accept).flatMap(([m, e]) => [m, ...e]).join(',')}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {!file ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => input.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
          className={clsx(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition',
            drag ? 'border-royal-500 bg-royal-50' : shownError ? 'border-red-300 bg-red-50/40' : 'border-royal-200 bg-slate-50/60 hover:border-royal-400 hover:bg-royal-50/50',
          )}
        >
          <UploadCloud className="h-10 w-10 text-royal-600" strokeWidth={1.6} />
          <p className="text-[15px] font-semibold text-navy-900">
            Drag & drop or <span className="text-royal-700 underline">browse</span>
          </p>
          <p className="text-xs text-slate-500">
            Accepted: {formats} · Max {MAX_UPLOAD_MB} MB
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 p-3 sm:p-4">
            <div className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-xl', isImage ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-brand-red')}>
              {isImage ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-800" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {formatBytes(file.size)} · {file.type || 'unknown type'}
              </p>
            </div>
            <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-royal-700 hover:bg-royal-50">
              <RefreshCw className="h-4 w-4" /> <span className="hidden sm:inline">Replace</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setLocalError(null);
                onChange(null);
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-brand-red hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> <span className="hidden sm:inline">Remove</span>
            </button>
          </div>
          {preview && (
            <div className="border-t border-slate-100 bg-slate-50 p-3">
              {isImage ? (
                <img src={preview} alt="Selected document preview" className="mx-auto max-h-72 rounded-lg object-contain" />
              ) : file.type === 'application/pdf' ? (
                <iframe src={preview} title="PDF preview" className="h-72 w-full rounded-lg border border-slate-200 bg-white" />
              ) : null}
            </div>
          )}
        </div>
      )}
      {shownError ? <p className="mt-1.5 text-sm text-brand-red">{shownError}</p> : hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
