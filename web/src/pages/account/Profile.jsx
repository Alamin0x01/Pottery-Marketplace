import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Container, PageTitle } from '../../components/layout/Layout.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Icon } from '../../components/ui/Icon.jsx';
import { SelectField, TextField } from '../../components/ui/Fields.jsx';
import { ErrorState, PageSpinner } from '../../components/ui/States.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { storeApi } from '../../services/storeApi.js';
import { fieldErrorsFromApi, validateAddress, validateProfile } from '../../utils/validation.js';
import { formatPhone } from '../../utils/format.js';

const tab = ({ isActive }) => `rounded-full px-4 py-2 text-sm font-medium transition ${isActive ? 'bg-terracotta-600 text-white' : 'text-clay-brown hover:bg-beige/70'}`;

export function AccountLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Container className="pb-8">
      <PageTitle title="My account" />
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-sand/70 pb-4">
        <nav aria-label="Account" className="flex gap-2">
          <NavLink end to="/account" className={tab}>Profile</NavLink>
          <NavLink to="/account/orders" className={tab}>My orders</NavLink>
        </nav>
        <Button variant="secondary" size="sm" onClick={async () => { await logout(); navigate('/'); }}><Icon name="logout" className="h-4 w-4" /> Sign out</Button>
      </div>
      <Outlet />
    </Container>
  );
}

function ProfileForm({ initial, submitLabel, onSubmit, intro }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const found = validateProfile(form);
    setErrors(found);
    setMessage(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await onSubmit({ name: form.name.trim(), phone: form.phone.trim() });
      setMessage({ ok: true, text: 'Saved.' });
    } catch (err) {
      const fromApi = fieldErrorsFromApi(err);
      setErrors(fromApi);
      setMessage({ ok: false, text: Object.keys(fromApi).length ? 'Please fix the highlighted fields.' : err.message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {intro}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} maxLength={100} autoComplete="name" />
        <TextField label="Phone number" required type="tel" inputMode="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} error={errors.phone} maxLength={20} autoComplete="tel" placeholder="01712345678" />
      </div>
      {message && <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-2.5 text-sm ${message.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'}`}>{message.text}</p>}
      <Button type="submit" loading={busy}>{submitLabel}</Button>
    </form>
  );
}

const EMPTY_ADDRESS = { label: '', recipientName: '', phone: '', line: '', district: '', isDefault: false };

function AddressForm({ initial = EMPTY_ADDRESS, districts, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const found = validateAddress(form, districts);
    setErrors(found);
    setError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await onSave({ label: form.label.trim(), recipientName: form.recipientName.trim(), phone: form.phone.trim(), line: form.line.trim(), district: form.district, isDefault: form.isDefault });
    } catch (err) {
      const fromApi = fieldErrorsFromApi(err);
      setErrors(fromApi);
      setError(Object.keys(fromApi).length ? 'Please fix the highlighted fields.' : err.message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl border border-terracotta-100 bg-terracotta-50/40 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Label" required hint="e.g. Home, Office" value={form.label} onChange={set('label')} error={errors.label} maxLength={30} />
        <TextField label="Recipient name" required value={form.recipientName} onChange={set('recipientName')} error={errors.recipientName} maxLength={100} />
        <TextField label="Phone" required type="tel" inputMode="tel" placeholder="01712345678" value={form.phone} onChange={set('phone')} error={errors.phone} maxLength={20} />
        <SelectField label="District" required placeholder="Choose a district" options={districts} value={form.district} onChange={set('district')} error={errors.district} />
      </div>
      <TextField label="Full address" required multiline value={form.line} onChange={set('line')} error={errors.line} maxLength={300} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} className="h-4 w-4 rounded border-sand text-terracotta-600" /> Use as my default address</label>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}
      <div className="flex gap-2"><Button type="submit" loading={busy}>Save address</Button><Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button></div>
    </form>
  );
}

function Addresses({ profile }) {
  const { setAddresses } = useAuth();
  const districts = useAsync((signal) => storeApi.districts(signal), []);
  const [editing, setEditing] = useState(null); // null | 'new' | address id
  const [error, setError] = useState(null);
  const addresses = profile.addresses ?? [];

  const run = async (action) => {
    setError(null);
    try {
      setAddresses(await action());
    } catch (err) {
      setError(err.message);
    }
  };
  const done = () => setEditing(null);

  return (
    <section className="rounded-3xl border border-sand bg-white/70 p-6" aria-labelledby="addresses-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="addresses-heading" className="text-2xl text-clay-brown">Saved addresses</h2>
          <p className="text-sm text-clay-soft">Up to 5 addresses, used to fill in checkout quickly.</p>
        </div>
        {editing === null && addresses.length < 5 && <Button variant="secondary" size="sm" onClick={() => setEditing('new')}><Icon name="plus" className="h-4 w-4" /> Add address</Button>}
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800">{error}</p>}

      <div className="mt-5 space-y-4">
        {editing === 'new' && (
          <AddressForm districts={districts.data ?? []} onCancel={done} onSave={async (body) => { setAddresses(await storeApi.addAddress(body)); done(); }} />
        )}
        {addresses.length === 0 && editing !== 'new' && <p className="rounded-2xl border border-dashed border-sand px-4 py-8 text-center text-sm text-clay-soft">No saved addresses yet.</p>}
        {addresses.map((a) =>
          editing === a.id ? (
            <AddressForm key={a.id} initial={a} districts={districts.data ?? []} onCancel={done} onSave={async (body) => { setAddresses(await storeApi.updateAddress(a.id, body)); done(); }} />
          ) : (
            <article key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-sand bg-cream/60 p-4">
              <div className="min-w-0 text-sm">
                <p className="flex items-center gap-2 font-medium text-clay-brown">{a.label}{a.isDefault && <span className="rounded-full bg-terracotta-100 px-2 py-0.5 text-xs text-terracotta-700">Default</span>}</p>
                <p className="mt-1">{a.recipientName} · {formatPhone(a.phone)}</p>
                <p className="text-clay-soft">{a.line}, {a.district}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {!a.isDefault && <Button size="sm" variant="ghost" onClick={() => run(() => storeApi.updateAddress(a.id, { isDefault: true }))}>Make default</Button>}
                <Button size="sm" variant="ghost" onClick={() => setEditing(a.id)}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => run(() => storeApi.removeAddress(a.id))} aria-label={`Delete address ${a.label}`}>Delete</Button>
              </div>
            </article>
          ),
        )}
      </div>
    </section>
  );
}

export function ProfilePage() {
  const { user, profile, profileState, saveProfile, reloadProfile } = useAuth();
  if (profileState === 'loading' || profileState === 'idle') return <PageSpinner label="Loading your profile…" />;
  if (profileState === 'error') return <ErrorState error={{ message: 'We could not load your profile.' }} onRetry={reloadProfile} />;

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-sand bg-white/70 p-6">
        <ProfileForm
          initial={{ name: '', phone: '' }}
          submitLabel="Create my profile"
          onSubmit={saveProfile}
          intro={<><h2 className="text-2xl text-clay-brown">Complete your profile</h2><p className="text-sm text-clay-soft">Your account ({user.email}) needs a name and phone number before you can order.</p></>}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr] lg:items-start">
      <section className="rounded-3xl border border-sand bg-white/70 p-6" aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="text-2xl text-clay-brown">Your details</h2>
        <dl className="mt-4 text-sm">
          <dt className="text-clay-soft">Email</dt>
          <dd className="font-medium">{profile.email ?? user.email}</dd>
        </dl>
        <div className="mt-5 border-t border-sand pt-5">
          <ProfileForm initial={{ name: profile.name, phone: profile.phone }} submitLabel="Save changes" onSubmit={saveProfile} />
        </div>
      </section>
      <Addresses profile={profile} />
    </div>
  );
}
