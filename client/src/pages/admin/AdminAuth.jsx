import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthShell, Field, FormError } from '../../components/AuthShell.jsx';
import { Spinner } from '../../components/Brand.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { auth } from '../../services/api.js';

export default function AdminAuth() {
  const [form, setForm] = useState({ email: '', password: '' });
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
      const result = await auth.adminLogin(form.email, form.password);
      signIn(result);
      toast.success('Command centre online');
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      eyebrow="University control centre"
      title="Admin access"
      subtitle="The centralised payment system: live activity, analytics and merchant payouts."
      demoCredentials={[
        {
          email: 'admin@unipay.demo',
          password: 'admin123',
          onUse: () => {
            setForm({ email: 'admin@unipay.demo', password: 'admin123' });
            setError(null);
          },
        },
      ]}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field
          label="Admin email"
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="admin@unipay.demo"
          required
          autoComplete="email"
          inputMode="email"
        />
        <Field
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          placeholder="••••••••"
          required
          autoComplete="current-password"
        />

        <FormError message={error} />

        <button type="submit" className="btn-primary btn-lg w-full" disabled={busy}>
          {busy ? <Spinner /> : 'Enter control centre'}
        </button>
      </form>
    </AuthShell>
  );
}
