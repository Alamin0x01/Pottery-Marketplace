import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card.jsx';
import { TextField } from '../../components/ui/Fields.jsx';
import { Button, BUTTON_BASE, BUTTON_VARIANTS } from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { SecretDialog } from '../../features/devices/SecretDialog.jsx';
import { adminApi } from '../../services/adminApi.js';
import { fieldErrorsFromApi, validateDeviceForm } from '../../utils/validation.js';

export function DeviceNewPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ model: 'ESP32-S3 + A7670E', pollIntervalSec: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  // Held only in memory, only until the dialog is closed.
  const [provisioning, setProvisioning] = useState(null);

  async function submit(e) {
    e.preventDefault();
    const found = validateDeviceForm(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      const body = {};
      if (form.model.trim()) body.model = form.model.trim();
      if (form.pollIntervalSec !== '') body.pollIntervalSec = Number(form.pollIntervalSec);
      const res = await adminApi.devices.register(body);
      setProvisioning(res.provisioning);
    } catch (err) {
      const fromApi = fieldErrorsFromApi(err);
      setErrors(fromApi);
      setFormError(Object.keys(fromApi).length > 0 ? 'Please fix the highlighted fields.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="Register device" subtitle="A Device ID and a secret are generated for you. The secret is shown once." back={{ to: '/devices', label: 'All devices' }} />
      <form onSubmit={submit} noValidate className="space-y-5">
        <Card bodyClassName="grid gap-4 p-5 sm:grid-cols-2">
          <TextField label="Device model" hint="Optional, e.g. ESP32-S3 + A7670E" value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} error={errors.model} maxLength={100} />
          <TextField label="Polling interval (seconds)" hint="Optional. How often the device contacts the server (30–3600, default 300)." inputMode="numeric" value={form.pollIntervalSec} onChange={(e) => setForm((f) => ({ ...f, pollIntervalSec: e.target.value }))} error={errors.pollIntervalSec} />
        </Card>
        <p className="text-sm text-charcoal-soft">
          The device starts <strong>unassigned</strong> and cannot act for any potter until you assign it.
        </p>
        {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{formError}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Link to="/devices" className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary}`}>Cancel</Link>
          <Button type="submit" variant="primary" loading={busy}>Generate device and credentials</Button>
        </div>
      </form>
      {provisioning && (
        <SecretDialog
          provisioning={provisioning}
          onDone={() => {
            const id = provisioning.deviceId;
            setProvisioning(null);
            navigate(`/devices/${id}`, { state: { notice: `Device ${id} registered. Assign it to a potter to put it into service.` } });
          }}
        />
      )}
    </div>
  );
}
