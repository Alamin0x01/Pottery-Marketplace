import { useState } from 'react';
import { Modal } from './Modal.jsx';
import { Button } from './Button.jsx';
import { TextField } from './Fields.jsx';

/**
 * Confirmation for consequential actions. `onConfirm(reason)` may be async: the dialog stays open and shows the
 * server's message if it fails, and closes only on success. With `askReason`, a short reason (3–200 chars) is
 * collected and written to the audit trail.
 */
export function ConfirmDialog({ title, description, confirmLabel = 'Confirm', tone = 'danger', askReason = false, reasonRequired = false, onConfirm, onClose, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [reason, setReason] = useState('');

  const trimmed = reason.trim();
  const reasonError = askReason && (reasonRequired || trimmed) && (trimmed.length < 3 || trimmed.length > 200) ? 'Enter 3–200 characters.' : null;
  const blocked = Boolean(reasonError) || (askReason && reasonRequired && !trimmed);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm(askReason && trimmed ? trimmed : undefined);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={title}
      description={description}
      onClose={onClose}
      locked={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy} data-autofocus>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} loading={busy} disabled={blocked}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-charcoal-soft">
        {children}
        {askReason && (
          <TextField
            label={reasonRequired ? 'Reason' : 'Reason (optional)'}
            hint="Saved in the audit trail."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={reasonError}
            maxLength={200}
            disabled={busy}
          />
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
            {error.message ?? 'The action failed.'}
          </p>
        )}
      </div>
    </Modal>
  );
}
