import { useState } from 'react';
import { Modal } from '../../components/ui/Modal.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/States.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { adminApi } from '../../services/adminApi.js';
import { formatBdPhone } from '../../utils/phone.js';

function Choice({ checked, onChange, title, subtitle, name }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${checked ? 'border-terracotta-500 bg-terracotta-50' : 'border-line hover:bg-stone-50'}`}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 h-4 w-4 text-terracotta-600 focus:ring-terracotta-500" />
      <span className="min-w-0">
        <span className="block font-medium text-charcoal">{title}</span>
        <span className="block text-xs text-charcoal-soft">{subtitle}</span>
      </span>
    </label>
  );
}

/** Assigns (or reassigns) `device` to an active potter chosen by name, phone or Potter ID. */
export function AssignDeviceDialog({ device, onAssigned, onClose }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const q = useDebounce(query.trim(), 300);
  const potters = useAsync((signal) => adminApi.potters.list({ q, status: 'active', limit: 8 }, signal), [q]);
  const reassigning = Boolean(device.potterId);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.devices.assign(device.id, selected.id);
      onAssigned(res.device);
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const items = (potters.data?.items ?? []).filter((p) => p.id !== device.potterId);
  return (
    <Modal
      title={reassigning ? `Reassign ${device.id}` : `Assign ${device.id}`}
      description={reassigning ? `Currently owned by ${device.potter?.name ?? device.potterId}. A device always has exactly one owner.` : 'Choose the potter who will use this device.'}
      onClose={onClose}
      locked={busy}
      size="max-w-lg"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!selected} loading={busy}>{reassigning ? 'Reassign device' : 'Assign device'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <input
          type="search"
          data-autofocus
          aria-label="Search potters"
          placeholder="Search active potters by name, phone or POT-…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="block w-full rounded-lg border border-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta-500"
        />
        <div className="min-h-24 space-y-2" aria-live="polite">
          {potters.loading && !potters.data ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : potters.error ? (
            <ErrorState error={potters.error} onRetry={potters.reload} compact />
          ) : items.length === 0 ? (
            <EmptyState icon="potters" title="No matching active potter" description="Only active potters can receive devices." />
          ) : (
            items.map((p) => (
              <Choice key={p.id} name="potter" checked={selected?.id === p.id} onChange={() => setSelected(p)} title={`${p.name} · ${p.id}`} subtitle={`${p.village}, ${p.district} · ${formatBdPhone(p.phone)}`} />
            ))
          )}
        </div>
        {reassigning && selected && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {device.potter?.name ?? 'The previous owner'} will lose this device. Orders still waiting to be delivered to it are moved to that potter’s other active device, or flagged for follow-up if there is none.
          </p>
        )}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error.message}</p>}
      </div>
    </Modal>
  );
}

/** From a potter's profile: pick one of the currently unassigned devices to give to `potter`. */
export function AssignToPotterDialog({ potter, onAssigned, onClose }) {
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const devices = useAsync((signal) => adminApi.devices.list({ status: 'unassigned', limit: 50 }, signal), []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await adminApi.devices.assign(selected, potter.id);
      onAssigned();
      onClose();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const items = devices.data?.items ?? [];
  return (
    <Modal
      title={`Assign a device to ${potter.name}`}
      description="Only devices that are not owned by anyone are listed. To move a device between potters, use Reassign on the device page."
      onClose={onClose}
      locked={busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!selected} loading={busy}>Assign device</Button>
        </>
      }
    >
      <div className="space-y-2" aria-live="polite">
        {devices.loading && !devices.data ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : devices.error ? (
          <ErrorState error={devices.error} onRetry={devices.reload} compact />
        ) : items.length === 0 ? (
          <EmptyState icon="devices" title="No unassigned devices" description="Register a new device first, then assign it here." />
        ) : (
          items.map((d) => (
            <Choice key={d.id} name="device" checked={selected === d.id} onChange={() => setSelected(d.id)} title={d.id} subtitle={`${d.model ?? 'Model not set'}${d.hasCredential ? '' : ' · no valid credential (issue one first)'}`} />
          ))
        )}
        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error.message}</p>}
      </div>
    </Modal>
  );
}
