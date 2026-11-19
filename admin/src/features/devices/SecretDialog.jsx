import { useState } from 'react';
import { Modal } from '../../components/ui/Modal.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { CopyButton } from '../../components/ui/CopyButton.jsx';

/**
 * Shows a newly generated device secret. This is the ONLY time it exists in readable form: the server stores just a
 * hash. The dialog cannot be dismissed until the admin confirms the secret was stored, and the parent drops the
 * value from memory as soon as it closes. It is never written to storage, the URL or the console.
 */
export function SecretDialog({ provisioning, reissued = false, onDone }) {
  const [saved, setSaved] = useState(false);
  const config = `DEVICE_ID=${provisioning.deviceId}\nDEVICE_SECRET=${provisioning.secret}`;
  return (
    <Modal
      title={reissued ? 'New device credentials' : 'Device registered: credentials'}
      description="Copy these into the device firmware configuration now. The secret is shown only once and cannot be retrieved later."
      locked
      size="max-w-lg"
      footer={<Button variant="primary" disabled={!saved} onClick={onDone}>Done</Button>}
    >
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Device ID</dt>
          <dd className="mt-1 flex items-center justify-between gap-2">
            <code className="rounded bg-stone-100 px-2 py-1 font-mono text-sm">{provisioning.deviceId}</code>
            <CopyButton text={provisioning.deviceId} />
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-charcoal-soft">Device secret</dt>
          <dd className="mt-1 flex items-start justify-between gap-2">
            <code data-testid="device-secret" className="break-all rounded bg-stone-100 px-2 py-1 font-mono text-sm">{provisioning.secret}</code>
            <CopyButton text={provisioning.secret} />
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex justify-end"><CopyButton text={config} label="Copy both as config lines" /></div>
      <p role="note" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Treat the secret like a password: anyone who has it can act as this device. If it is lost or exposed, revoke it and issue new credentials from the device page.
      </p>
      <label className="mt-4 flex items-start gap-2 text-sm text-charcoal">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-line text-terracotta-600 focus:ring-terracotta-500" />
        <span>I have copied the secret to a safe place.</span>
      </label>
    </Modal>
  );
}
