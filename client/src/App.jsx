import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { Spinner, UniPayMark } from './components/Brand.jsx';

import Landing from './pages/Landing.jsx';
import StudentAuth from './pages/student/StudentAuth.jsx';
import StudentDashboard from './pages/student/StudentDashboard.jsx';
import MerchantAuth from './pages/merchant/MerchantAuth.jsx';
import MerchantDashboard from './pages/merchant/MerchantDashboard.jsx';
import AdminAuth from './pages/admin/AdminAuth.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';

/** Where each role belongs once authenticated. */
const HOME_FOR = { STUDENT: '/student', MERCHANT: '/merchant', ADMIN: '/admin' };

function BootScreen() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-ink-950">
      <UniPayMark size={56} className="animate-pop-in" />
      <Spinner className="h-6 w-6 text-brand-400" />
      <p className="text-xs font-bold uppercase tracking-[.2em] text-slate-500">Connecting to campus server</p>
    </div>
  );
}

/** Gate a route on a role; bounce a mismatched role to its own home. */
function Protected({ role, children }) {
  const { session, booting } = useAuth();
  const location = useLocation();

  if (booting) return <BootScreen />;
  if (!session) return <Navigate to={`/${role.toLowerCase()}/login`} replace state={{ from: location.pathname }} />;
  if (session.role !== role) return <Navigate to={HOME_FOR[session.role] ?? '/'} replace />;

  return children;
}

/** Login pages redirect away if you are already signed in as that role. */
function GuestOnly({ role, children }) {
  const { session, booting } = useAuth();
  if (booting) return <BootScreen />;
  if (session?.role === role) return <Navigate to={HOME_FOR[role]} replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />

      <Route path="/student/login" element={<GuestOnly role="STUDENT"><StudentAuth /></GuestOnly>} />
      <Route path="/student/*" element={<Protected role="STUDENT"><StudentDashboard /></Protected>} />

      <Route path="/merchant/login" element={<GuestOnly role="MERCHANT"><MerchantAuth /></GuestOnly>} />
      <Route path="/merchant/*" element={<Protected role="MERCHANT"><MerchantDashboard /></Protected>} />

      <Route path="/admin/login" element={<GuestOnly role="ADMIN"><AdminAuth /></GuestOnly>} />
      <Route path="/admin/*" element={<Protected role="ADMIN"><AdminDashboard /></Protected>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
