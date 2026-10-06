import { Link, Outlet, useParams, Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { LoadingState } from '../components/common/UI';
import Navbar from '../components/layout/Navbar';
export default function DashboardLayout({
  sellerRoute = false,
  adminRoute = false,
  superAdminRoute = false,
}) {
  const { role: requested } = useParams();
  const { identity, role, restoring, accountError } = useApp();
  if (restoring) return <LoadingState />;
  if (!identity) return <Navigate to="/login" replace />;
  const allowedRoute = sellerRoute
    ? role === 'seller'
    : adminRoute
      ? ['admin', 'super_admin'].includes(role)
      : superAdminRoute
        ? role === 'super_admin'
        : requested === role;
  if (!allowedRoute)
    return (
      <Navigate
        to={
          role === 'seller'
            ? '/seller/dashboard'
            : role === 'admin'
              ? '/admin/dashboard'
              : role === 'super_admin'
                ? '/super-admin/dashboard'
                : '/'
        }
        replace
      />
    );
  const sections =
    role === 'customer'
      ? ['profile', 'orders', 'try-on-history']
      : role === 'seller'
        ? ['profile', 'products']
        : [
            'overview',
            'users',
            'sellers',
            'products',
            'categories',
            'orders',
            'try-on-sessions',
            ...(role === 'super_admin' ? ['admins'] : []),
          ];
  const dashboardPath = sellerRoute
    ? '/seller/dashboard'
    : adminRoute
      ? '/admin/dashboard'
      : superAdminRoute
        ? '/super-admin/dashboard'
        : `/dashboard/${role}`;
  return (
    <>
      <Navbar />
      <div className="container page production-dashboard">
        <aside>
          <h2>
            {role === 'super_admin'
              ? 'Super Admin'
              : role === 'admin'
                ? 'Admin'
                : `${role.replace('_', ' ')} account`}
          </h2>
          <nav>
            {sections.map((s) => (
              <Link key={s} to={s === 'overview' ? dashboardPath : `${dashboardPath}/${s}`}>
                {s.replaceAll('-', ' ')}
              </Link>
            ))}
            {role === 'super_admin' && (
              <section className="super-admin-nav" aria-label="Super Admin controls">
                <strong>Super Admin controls</strong>
                <Link to={`${dashboardPath}/admins`}>Manage Admin accounts</Link>
              </section>
            )}
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
