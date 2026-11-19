import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Container } from '../components/layout/Layout.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/Fields.jsx';
import { Brand } from '../components/layout/Brand.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { fieldErrorsFromApi, MIN_PASSWORD, validateLogin, validateRegistration } from '../utils/validation.js';

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <Container className="py-12 sm:py-16">
      <div className="mx-auto max-w-md animate-fade-up">
        <div className="mb-8 flex justify-center"><Brand /></div>
        <div className="rounded-3xl border border-sand bg-white/80 p-7 shadow-sm sm:p-9">
          <h1 className="text-3xl text-clay-brown">{title}</h1>
          <p className="mt-1 text-sm text-clay-soft">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-sm text-clay-soft">{footer}</p>
      </div>
    </Container>
  );
}

export function LoginPage() {
  const { login, notice } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const found = validateLogin(form);
    setErrors(found);
    setError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await login(form.email, form.password); // on success the router redirects (RedirectIfSignedIn)
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to see your orders and saved addresses."
      footer={<>New to Mati? <Link to="/register" state={location.state} className="font-medium text-terracotta-700 underline">Create an account</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {notice && <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{notice}</p>}
        <TextField label="Email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors.email} />
        <TextField label="Password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} error={errors.password} />
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>Sign in</Button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const location = useLocation();
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    const found = validateRegistration(form);
    setErrors(found);
    setError(null);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    try {
      await register(form); // on success the router redirects (RedirectIfSignedIn)
    } catch (err) {
      const fromApi = fieldErrorsFromApi(err);
      setErrors(fromApi);
      setError(Object.keys(fromApi).length > 0 ? 'Please fix the highlighted fields.' : err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Track your orders and save delivery addresses."
      footer={<>Already have an account? <Link to="/login" state={location.state} className="font-medium text-terracotta-700 underline">Sign in</Link></>}
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <TextField label="Full name" required autoComplete="name" value={form.name} onChange={set('name')} error={errors.name} maxLength={100} />
        <TextField label="Phone number" required type="tel" inputMode="tel" autoComplete="tel" placeholder="01712345678" hint="Potters call this number about your orders." value={form.phone} onChange={set('phone')} error={errors.phone} maxLength={20} />
        <TextField label="Email" required type="email" autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <TextField label="Password" required type="password" autoComplete="new-password" hint={`At least ${MIN_PASSWORD} characters.`} value={form.password} onChange={set('password')} error={errors.password} />
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy}>Create account</Button>
      </form>
    </AuthShell>
  );
}
