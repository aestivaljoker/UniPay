import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthShell, AuthTabs, Field, FormError } from '../../components/AuthShell.jsx';
import { Spinner } from '../../components/Brand.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { auth } from '../../services/api.js';

const EMPTY = { ownerName: '', shopName: '', email: '', merchantId: '', password: '', category: '', location: '' };

export default function MerchantAuth() {
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
          ? await auth.merchantLogin(form.email, form.password)
          : await auth.merchantSignup({
              ownerName: form.ownerName,
              shopName: form.shopName,
              email: form.email,
              merchantId: form.merchantId,
              password: form.password,
              category: form.category,
              location: form.location,
            });

      signIn(result);
      toast.success(mode === 'login' ? `${result.profile.shopName} ready` : 'Shop registered — you can start scanning');
      navigate('/merchant', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const useDemo = () => {
    setMode('login');
    setForm({ ...EMPTY, email: 'canteen@unipay.demo', password: '123456' });
    setError(null);
  };

  return (
    <AuthShell
      eyebrow="Merchant POS"
      title={mode === 'login' ? 'Shop login' : 'Register your shop'}
      subtitle={
        mode === 'login'
          ? 'Log in to scan student QR codes and take payments.'
          : 'Campus vendors get paid by the university, not by each student.'
      }
      demoCredentials={
        mode === 'login' ? [{ email: 'canteen@unipay.demo', password: '123456', onUse: useDemo }] : null
      }
    >
      <AuthTabs mode={mode} onChange={(m) => { setMode(m); setError(null); }} />

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'signup' && (
          <>
            <Field label="Shop name" value={form.shopName} onChange={set('shopName')} placeholder="Canteen Shop #1" required />
            <Field label="Owner name" value={form.ownerName} onChange={set('ownerName')} placeholder="Rahul Kumar" required autoComplete="name" />
            <Field
              label="Merchant ID"
              value={form.merchantId}
              onChange={set('merchantId')}
              placeholder="CANTEEN001"
              hint="Letters and numbers only."
              required
              autoCapitalize="characters"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category" value={form.category} onChange={set('category')} placeholder="Food & Beverage" />
              <Field label="Location" value={form.location} onChange={set('location')} placeholder="Block A" />
            </div>
          </>
        )}

        <Field
          label="Email"
          type="email"
          value={form.email}
          onChange={set('email')}
          placeholder="shop@unipay.demo"
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
        />

        <FormError message={error} />

        <button type="submit" className="btn-mint btn-lg w-full" disabled={busy}>
          {busy ? <Spinner /> : mode === 'login' ? 'Open POS' : 'Register shop'}
        </button>
      </form>
    </AuthShell>
  );
}
