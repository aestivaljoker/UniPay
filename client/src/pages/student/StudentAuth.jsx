import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthShell, AuthTabs, Field, FormError } from '../../components/AuthShell.jsx';
import { Spinner } from '../../components/Brand.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { auth } from '../../services/api.js';

const EMPTY = { name: '', email: '', studentId: '', password: '', course: '', year: '' };

export default function StudentAuth() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const result =
        mode === 'login'
          ? await auth.studentLogin(form.email, form.password)
          : await auth.studentSignup({
              name: form.name,
              email: form.email,
              studentId: form.studentId,
              password: form.password,
              course: form.course,
              year: form.year ? Number(form.year) : null,
            });

      signIn(result);
      toast.success(
        mode === 'login' ? `Welcome back, ${result.profile.name.split(' ')[0]}` : 'Wallet created — top up to get started',
        { tone: 'success' }
      );
      navigate('/student', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const useDemo = () => {
    setMode('login');
    setForm({ ...EMPTY, email: 'devansh@unipay.demo', password: '123456' });
    setError(null);
  };

  return (
    <AuthShell
      eyebrow="Student wallet"
      title={mode === 'login' ? 'Welcome back' : 'Create your wallet'}
      subtitle={
        mode === 'login'
          ? 'Log in to see your balance and show your campus ID QR.'
          : 'Your Student ID becomes your UniPay ID and your QR code.'
      }
      demoCredentials={
        mode === 'login' ? [{ email: 'devansh@unipay.demo', password: '123456', onUse: useDemo }] : null
      }
    >
      <AuthTabs mode={mode} onChange={(m) => { setMode(m); setError(null); }} />

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'signup' && (
          <>
            <Field label="Full name" value={form.name} onChange={set('name')} placeholder="Devansh Ojha" required autoComplete="name" />
            <Field
              label="Student ID"
              value={form.studentId}
              onChange={set('studentId')}
              placeholder="GU2026DEV"
              hint="Letters and numbers only — this becomes your QR identity."
              required
              autoCapitalize="characters"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Course" value={form.course} onChange={set('course')} placeholder="B.Tech CSE" />
              <Field label="Year" type="number" min="1" max="6" value={form.year} onChange={set('year')} placeholder="3" />
            </div>
          </>
        )}

        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="you@unipay.demo"
          required
          autoComplete="email"
          inputMode="email"
        />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          placeholder="••••••"
          required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          hint={mode === 'signup' ? 'At least 6 characters. Stored hashed with bcrypt.' : null}
        />

        <FormError message={error} />

        <button type="submit" className="btn-primary btn-lg w-full" disabled={busy}>
          {busy ? <Spinner /> : mode === 'login' ? 'Log in' : 'Create wallet'}
        </button>
      </form>
    </AuthShell>
  );
}
