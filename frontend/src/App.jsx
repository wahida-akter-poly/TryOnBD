import { Component, Suspense, lazy, useEffect } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useApp } from './context/AppContext';
import Navbar from './components/layout/Navbar';
import Footer from './components/layout/Footer';
import CartDrawer from './components/layout/CartDrawer';
import { ErrorState, LoadingState, Toast } from './components/common/UI';
import Home from './pages/public/Home';
import Products, { Categories } from './pages/public/Products';
import ProductDetails from './pages/public/ProductDetails';
import Checkout, { Invoice } from './pages/public/Checkout';
import About, { NotFound } from './pages/public/About';
import Auth from './pages/auth/Auth';
const TryOn = lazy(() => import('./pages/public/TryOn'));
const DashboardLayout = lazy(() => import('./layouts/DashboardLayout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));

class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <div className="container page">
        <ErrorState
          message="This view could not load. Please try again."
          retry={() => window.location.reload()}
        />
      </div>
    ) : (
      this.props.children
    );
  }
}
function StoreLayout() {
  return (
    <>
      <Navbar />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${pathname === '/' ? 'A new way to see yourself' : pathname.split('/').filter(Boolean).at(-1).replaceAll('-', ' ')} · TryOnBD`;
  }, [pathname]);
  return null;
}
export default function App() {
  const { toasts, dismissToast } = useApp();
  const location = useLocation();
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <ScrollReset />
      <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<LoadingState />}>
          <Routes>
            <Route element={<StoreLayout />}>
              <Route index element={<Home />} />
              <Route path="products" element={<Products />} />
              <Route path="products/:id" element={<ProductDetails />} />
              <Route path="categories" element={<Categories />} />
              <Route path="search" element={<Products />} />
              <Route path="try-on" element={<TryOn />} />
              <Route path="about" element={<About />} />
              <Route path="checkout" element={<Checkout />} />
              <Route path="invoice/:id" element={<Invoice />} />
              {['login', 'register'].map((path) => (
                <Route key={path} path={path} element={<Auth key={path} />} />
              ))}

              <Route path="*" element={<NotFound />} />
            </Route>
            <Route path="dashboard/:role" element={<DashboardLayout />}>
              <Route index element={<Dashboard key={location.pathname} />} />
              <Route path=":section" element={<Dashboard key={location.pathname} />} />
            </Route>
            <Route path="seller/dashboard" element={<DashboardLayout sellerRoute />}>
              <Route index element={<Dashboard key={location.pathname} />} />
              <Route path="products" element={<Dashboard key={location.pathname} />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <CartDrawer />
      <div className="toast-stack">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} dismiss={() => dismissToast(t.id)} />
        ))}
      </div>
    </>
  );
}
