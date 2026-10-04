import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
export default function Navbar() {
  const { identity, role, logout, state } = useApp();
  return (
    <header className="production-navbar">
      <div className="container">
        <Link className="brand" to="/">
          TryOnBD<span>SEE YOURSELF DIFFERENTLY</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/">Home</Link>
          <Link to="/products">Shop</Link>
          {['Eyewear', 'Clothing', 'Jewelry'].map((group) => (
            <Link key={group} to={`/products?group=${group}`}>
              {group}
            </Link>
          ))}
          <Link to="/try-on">Try-On</Link>
          <Link to="/checkout">Cart ({state.cart.reduce((n, item) => n + item.quantity, 0)})</Link>
          {identity ? (
            <>
              <Link to={`/dashboard/${role}`}>Account</Link>
              <button className="btn btn-ghost" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
