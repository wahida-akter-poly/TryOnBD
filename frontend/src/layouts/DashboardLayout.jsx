import { Link, Outlet, useParams, Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { LoadingState } from '../components/common/UI';
import Navbar from '../components/layout/Navbar';
export default function DashboardLayout() {
  const { role: requested } = useParams();
  const { identity, role, restoring, accountError } = useApp();
  if (restoring) return <LoadingState />;
  if (!identity) return <Navigate to="/login" replace />;
  if (requested !== role)
    return (
      <div className="container page">
        <h1>Access denied</h1>
        <Link to={`/dashboard/${role}`}>Open your account</Link>
      </div>
    );
  const sections =
    role === 'customer'
      ? ['profile', 'orders', 'try-on-history']
      : role === 'seller'
        ? ['profile', 'products']
        : ['profile', 'users', 'sellers', 'products', 'categories', 'orders'];
  return (
    <>
      <Navbar />
      <div className="container page production-dashboard">
        <aside>
          <h2>{role.replace('_', ' ')} account</h2>
          <nav>
            {sections.map((s) => (
              <Link key={s} to={`/dashboard/${role}/${s}`}>
                {s.replaceAll('-', ' ')}
              </Link>
            ))}
            <Link to="/checkout">Cart</Link>
          </nav>
        </aside>
        <main id="main-content">
          {accountError && (
            <p role="alert" className="error-text">
              {accountError}
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </>
  );
}
