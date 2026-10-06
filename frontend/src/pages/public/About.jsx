import { Link } from 'react-router-dom';
export default function About() {
  return (
    <div className="container page">
      <h1>A new perspective on style.</h1>
      <p>
        TryOnBD brings virtual try-on and shopping together. Explore products, preview supported
        designs with your camera or photo, and manage your orders in one place.
      </p>
    </div>
  );
}
export function NotFound() {
  return (
    <div className="container page">
      <h1>Page not found</h1>
      <p>The page you requested is unavailable.</p>
      <Link className="btn btn-primary" to="/products">
        Explore the collection
      </Link>
    </div>
  );
}
