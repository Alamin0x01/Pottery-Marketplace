import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card } from '../../components/ui/Card.jsx';
import { TextField, SelectField } from '../../components/ui/Fields.jsx';
import { Button, BUTTON_BASE, BUTTON_VARIANTS } from '../../components/ui/Button.jsx';
import { ErrorState, Skeleton } from '../../components/ui/States.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { adminApi } from '../../services/adminApi.js';
import { fieldErrorsFromApi, validatePotterForm } from '../../utils/validation.js';

const EMPTY = { name: '', phone: '', village: '', district: '', address: '' };

/** Shared by "Register potter" and "Edit potter". In edit mode only the changed fields are sent. */
function PotterForm({ initial, districts, onSubmit, submitLabel, cancelTo }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const check = validatePotterForm(values, districts);
    setErrors(check.errors);
    setFormError(null);
    if (Object.keys(check.errors).length > 0) return;
    setBusy(true);
    try {
      await onSubmit(check.values);
    } catch (err) {
      const fromApi = fieldErrorsFromApi(err);
      if (err.code === 'DUPLICATE_PHONE') fromApi.phone = 'Another potter is already registered with this phone number.';
      setErrors(fromApi);
      setFormError(Object.keys(fromApi).length > 0 ? 'Please fix the highlighted fields.' : err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Card bodyClassName="grid gap-4 p-5 sm:grid-cols-2">
        <TextField label="Full name" required autoComplete="off" value={values.name} onChange={set('name')} error={errors.name} maxLength={100} />
        <TextField label="Phone number" required type="tel" inputMode="tel" autoComplete="off" placeholder="01712345678" hint="Bangladesh mobile number. +880 is accepted." value={values.phone} onChange={set('phone')} error={errors.phone} maxLength={20} />
        <TextField label="Village" required autoComplete="off" value={values.village} onChange={set('village')} error={errors.village} maxLength={100} />
        <SelectField label="District" required placeholder="Choose a district" options={districts} value={values.district} onChange={set('district')} error={errors.district} />
        <div className="sm:col-span-2">
          <TextField label="Full address" required multiline autoComplete="off" hint="House, road, village, upazila: enough for a courier to find the potter." value={values.address} onChange={set('address')} error={errors.address} maxLength={300} />
        </div>
      </Card>
      {formError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{formError}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Link to={cancelTo} className={`${BUTTON_BASE} ${BUTTON_VARIANTS.secondary}`}>Cancel</Link>
        <Button type="submit" variant="primary" loading={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}

function FormSkeleton() {
  return (
    <Card bodyClassName="grid gap-4 p-5 sm:grid-cols-2">
      {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </Card>
  );
}

export function PotterNewPage() {
  const navigate = useNavigate();
  const meta = useAsync((signal) => adminApi.meta(signal), []);
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Register potter" subtitle="A Potter ID is generated automatically when you save." back={{ to: '/potters', label: 'All potters' }} />
      {meta.error ? (
        <Card><ErrorState error={meta.error} onRetry={meta.reload} /></Card>
      ) : !meta.data ? (
        <FormSkeleton />
      ) : (
        <PotterForm
          initial={EMPTY}
          districts={meta.data.districts}
          submitLabel="Register potter"
          cancelTo="/potters"
          onSubmit={async (values) => {
            const { potter } = await adminApi.potters.create(values);
            navigate(`/potters/${potter.id}`, { state: { notice: `Potter registered with ID ${potter.id}. You can now assign a device.` } });
          }}
        />
      )}
    </div>
  );
}

export function PotterEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const meta = useAsync((signal) => adminApi.meta(signal), []);
  const profile = useAsync((signal) => adminApi.potters.get(id, signal), [id]);
  const error = meta.error ?? profile.error;
  const potter = profile.data?.potter;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={potter ? `Edit ${potter.name}` : 'Edit potter'} subtitle={potter && `Potter ID ${potter.id} cannot be changed.`} back={{ to: `/potters/${id}`, label: 'Back to profile' }} />
      {error ? (
        <Card><ErrorState error={error} onRetry={() => { meta.reload(); profile.reload(); }} /></Card>
      ) : !meta.data || !potter ? (
        <FormSkeleton />
      ) : (
        <PotterForm
          initial={{ name: potter.name, phone: potter.phone, village: potter.village, district: potter.district, address: potter.address ?? '' }}
          districts={meta.data.districts}
          submitLabel="Save changes"
          cancelTo={`/potters/${id}`}
          onSubmit={async (values) => {
            const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== (potter[k] ?? '')));
            if (Object.keys(changed).length === 0) {
              const err = new Error('Nothing was changed.');
              err.code = 'NO_CHANGES';
              throw err;
            }
            await adminApi.potters.update(id, changed);
            navigate(`/potters/${id}`, { state: { notice: 'Potter details updated.' } });
          }}
        />
      )}
    </div>
  );
}
