import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';

interface Wrap {
  label?: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  optional?: boolean;
}

function FieldWrap({ id, label, error, hint, required, optional, children }: Wrap & { id: string; children: ReactNode }) {
  return (
    <div>
      {label && (
        <label htmlFor={id} className="label">
          {label}
          {required && <span className="ml-0.5 text-brand-red">*</span>}
          {optional && <span className="ml-1.5 text-xs font-normal text-slate-400">(optional)</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-sm text-brand-red">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, Wrap {
  icon?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, InputProps>(function TextField(
  { label, error, hint, required, optional, icon, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap id={fid} label={label} error={error} hint={hint} required={required} optional={optional}>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
        <input
          ref={ref}
          id={fid}
          aria-invalid={!!error}
          aria-describedby={error ? `${fid}-err` : undefined}
          className={clsx('field', icon && 'pl-11', error && 'field-error', className)}
          {...rest}
        />
      </div>
    </FieldWrap>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, InputProps>(function PasswordField({ icon, ...props }, ref) {
  const [show, setShow] = useState(false);
  const auto = useId();
  const fid = props.id ?? auto;
  return (
    <FieldWrap id={fid} label={props.label} error={props.error} hint={props.hint} required={props.required}>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
        <input
          ref={ref}
          {...props}
          id={fid}
          type={show ? 'text' : 'password'}
          aria-invalid={!!props.error}
          className={clsx('field pr-12', icon && 'pl-11', props.error && 'field-error', props.className)}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </div>
    </FieldWrap>
  );
});

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, Wrap {}
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, error, hint, required, optional, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap id={fid} label={label} error={error} hint={hint} required={required} optional={optional}>
      <textarea ref={ref} id={fid} aria-invalid={!!error} className={clsx('field min-h-[96px] resize-y', error && 'field-error', className)} {...rest} />
    </FieldWrap>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, Wrap {
  options: Array<{ value: string; label: string }>;
}
export function Select({ label, error, hint, options, className, id, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldWrap id={fid} label={label} error={error} hint={hint}>
      <select id={fid} className={clsx('field appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldWrap>
  );
}
