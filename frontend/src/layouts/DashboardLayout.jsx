import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Store,
  Package,
  Shapes,
  ShoppingBag,
  Star,
  ScanLine,
  Heart,
  Settings,
  BarChart3,
  Shield,
  Activity,
  Plus,
  User,
  CreditCard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ArrowUpRight,
  X,
} from 'lucide-react';
import { dashboardConfig } from '../data/dashboardConfig';
import { useApp } from '../context/AppContext';
import { Logo, RoleSwitcher } from '../components/layout/Navbar';
import { Avatar, Drawer, IconButton } from '../components/common/UI';
import DemoNotice, { ConnectionStatus } from '../components/common/DemoNotice';
import { NotFound } from '../pages/public/About';

const icons = {
  overview: LayoutDashboard,
  profile: User,
  'business-profile': Store,
  orders: ShoppingBag,
  reviews: Star,
  'write-review': Plus,
  'try-on-history': ScanLine,
  wishlist: Heart,
  settings: Settings,
  products: Package,
  'add-product': Plus,
  performance: BarChart3,
  subscription: CreditCard,
  users: Users,
  sellers: Store,
  categories: Shapes,
  sessions: ScanLine,
  reports: BarChart3,
  admins: Shield,
  analytics: BarChart3,
  permissions: Shield,
  activity: Activity,
};
export default function DashboardLayout() {
  const { role: routeRole, section = 'overview' } = useParams();
  const { user, setRole } = useApp();
  const config = dashboardConfig[routeRole];
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    if (config) setRole(routeRole);
  }, [routeRole, config, setRole]);
  if (!config) return <NotFound />;
  const nav = (
    <>
      <div className="sidebar-brand">
        <Logo />
      </div>
      <div className="sidebar-label">{collapsed ? 'DEMO' : config.title}</div>
      <nav aria-label={`${routeRole} dashboard navigation`}>
        {config.sections.map(([key, label]) => {
          const Icon = icons[key] || LayoutDashboard;
          return (
            <NavLink
              title={label}
              className={section === key ? 'active' : ''}
              key={key}
              end
              to={`/dashboard/${routeRole}${key === 'overview' ? '' : `/${key}`}`}
              onClick={() => setMobile(false)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-studio">
          <ScanLine size={25} />
          <strong>A new look awaits.</strong>
          <Link to="/try-on">
            Open the studio <ArrowUpRight size={15} />
          </Link>
        </div>
        <Link to="/" className="sidebar-store">
          ← Back to storefront
        </Link>
      </div>
    </>
  );
  return (
    <div className={`dashboard-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">{nav}</aside>
      <div className="dashboard-main">
        <header className="dashboard-topbar">
          <div className="flex items-center gap-3">
            <IconButton
              label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="desktop-sidebar-toggle"
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </IconButton>
            <IconButton
              label="Open dashboard navigation"
              className="mobile-menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </IconButton>
            <span className="dashboard-breadcrumb">
              Workspace <span>/</span>{' '}
              {config.sections.find(([key]) => key === section)?.[1] || 'Overview'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ConnectionStatus />
            <RoleSwitcher />
            <Avatar name={user.fullName} />
          </div>
        </header>
        <main id="main-content" className="dashboard-content">
          <DemoNotice compact />
          <Outlet />
        </main>
        <footer className="dashboard-footer">
          <span>TryOnBD · Frontend demo workspace</span>
          <Link to="/api-playground">Explore the API →</Link>
        </footer>
      </div>
      <Drawer open={mobile} onClose={() => setMobile(false)} title={config.title}>
        <div className="mobile-sidebar">{nav}</div>
      </Drawer>
    </div>
  );
}
