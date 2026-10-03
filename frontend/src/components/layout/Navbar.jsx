import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Menu, Search, ShoppingBag, ScanLine, ArrowUpRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { roles } from '../../utils/format';
import { Avatar, Drawer, Dropdown, IconButton } from '../common/UI';

export const Logo = ({ light = false }) => (
  <Link to="/" aria-label="TryOnBD home" className={`logo ${light ? 'logo-light' : ''}`}>
    <span className="logo-mark">
      <ScanLine size={23} />
    </span>
    TryOn<span className="logo-bd">BD</span>
    <span className="logo-dot">.</span>
  </Link>
);
export function RoleSwitcher() {
  const { role, setRole } = useApp();
  const navigate = useNavigate();
  return (
    <label className="role-switcher">
      <span>Demo Role</span>
      <select
        aria-label="Demo Role"
        value={role}
        onChange={(e) => {
          setRole(e.target.value);
          navigate(
            e.target.value === 'api-playground'
              ? '/api-playground'
              : `/dashboard/${e.target.value}`,
          );
        }}
      >
        {Object.entries({ ...roles, 'api-playground': 'API Playground' }).map(([key, title]) => (
          <option value={key} key={key}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}
export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { state, user, identity, logout, setCartOpen } = useApp();
  const navigate = useNavigate();
  const links = (
    <>
      <NavLink to="/products">Discover</NavLink>
      <NavLink to="/categories">Collections</NavLink>
      <NavLink to="/try-on">
        Virtual try-on <span className="tiny-tag">NEW</span>
      </NavLink>
      <NavLink to="/about">Our story</NavLink>
    </>
  );
  return (
    <>
      <div className="announcement">
        A little tradition. A new perspective.{' '}
        <Link to="/try-on">
          Find your look <ArrowUpRight size={12} />
        </Link>
        <span>Made for Bangladesh</span>
      </div>
      <header className="navbar">
        <div className="nav-main">
          <IconButton label="Open navigation" className="mobile-menu" onClick={() => setOpen(true)}>
            <Menu size={21} />
          </IconButton>
          <Logo />
          <nav className="desktop-nav" aria-label="Main navigation">
            {links}
          </nav>
          <div className="nav-actions">
            <form
              className="nav-search"
              onSubmit={(e) => {
                e.preventDefault();
                navigate(`/search?q=${encodeURIComponent(search)}`);
              }}
            >
              <input
                aria-label="Search the collection"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find your style"
              />
              <button aria-label="Submit search">
                <Search size={18} />
              </button>
            </form>
            <Dropdown
              label={
                <>
                  <Avatar name={user.fullName} />
                  {identity && <span className="nav-user-name">{user.fullName || user.name}</span>}
                  <ChevronDown size={12} />
                </>
              }
            >
              <Link to="/dashboard/customer">My demo account</Link>
              <Link to="/dashboard/customer/wishlist">My wishlist</Link>
              <Link to="/seller-register">Become a seller</Link>
              {identity ? (
                <button onClick={logout}>Sign out</button>
              ) : (
                <Link to="/login">Sign in</Link>
              )}
            </Dropdown>
            <IconButton
              label={`Open cart, ${state.cart.reduce((n, x) => n + x.quantity, 0)} items`}
              className="cart-icon"
              onClick={() => setCartOpen(true)}
            >
              <ShoppingBag size={21} />
              <span>{state.cart.reduce((n, x) => n + x.quantity, 0)}</span>
            </IconButton>
          </div>
        </div>
      </header>
      <Drawer open={open} onClose={() => setOpen(false)} title="Explore TryOnBD">
        <nav className="mobile-links" onClick={() => setOpen(false)}>
          {links}
          {identity ? <button onClick={logout}>Sign out</button> : <Link to="/login">Sign in</Link>}
          <Link to="/api-playground">API Playground</Link>
        </nav>
        <RoleSwitcher />
      </Drawer>
    </>
  );
}
