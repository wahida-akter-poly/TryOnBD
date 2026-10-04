import { Link } from 'react-router-dom';
export default function Footer() {
  return (
    <footer className="production-footer container">
      <strong>TryOnBD</strong>
      <p>A new perspective on personal style.</p>
      <Link to="/products">Shop</Link> | <Link to="/categories">Categories</Link> |{' '}
      <Link to="/about">About</Link>
    </footer>
  );
}
