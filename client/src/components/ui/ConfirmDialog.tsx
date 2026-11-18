import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { TextArea } from './Field';
import { Alert } from './Feedback';
import { ApiError } from '@/services/apiClient';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel: string;
  tone?: 'primary' | 'danger' | 'success';
  /** Show a remarks box. 'required' blocks confirmation until filled. */
  remarks?: 'required' | 'optional';
  remarksLabel?: string;
  remarksPlaceholder?: string;
  onConfirm: (remarks: string) => Promise<void>;
}

export function ConfirmDialog({
  open, onClose, title, description, children, confirmLabel, tone = 'primary', remarks, remarksLabel = 'Remarks', remarksPlaceholder, onConfirm,
}: Props) {
  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setText('');
      setFieldError(undefined);
      setError(null);
    }
  }, [open]);

  const confirm = async () => {
    if (remarks === 'required' && !text.trim()) return setFieldError(`${remarksLabel} are mandatory`);
    setLoading(true);
    setError(null);
    try {
      await onConfirm(text.trim());
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Action failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={confirm} loading={loading} data-autofocus={!remarks || undefined}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        {children}
        {remarks && (
          <TextArea
            label={remarksLabel}
            required={remarks === 'required'}
            optional={remarks === 'optional'}
            rows={4}
            maxLength={1000}
            placeholder={remarksPlaceholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFieldError(undefined);
            }}
            error={fieldError}
          />
        )}
      </div>
    </Modal>
  );
}
