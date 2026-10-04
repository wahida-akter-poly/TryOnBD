import { Link } from 'react-router-dom';
import Products from './Products';
export default function Home() {
  return (
    <>
      <section className="production-hero container">
        <span className="eyebrow">STYLE, IN YOUR OWN PERSPECTIVE</span>
        <h1>
          Find your next look.
          <br />
          <em>Try it on your terms.</em>
        </h1>
        <p>Explore the collection and preview supported products with your camera or a photo.</p>
        <div className="catalog-controls">
          <Link className="btn btn-primary" to="/products">
            Shop the collection
          </Link>
          <Link className="btn btn-ghost" to="/try-on">
            Explore virtual try-on
          </Link>
        </div>
        <nav className="collection-nav" aria-label="Collections">
          {['Eyewear', 'Clothing', 'Jewelry'].map((group) => (
            <Link key={group} to={`/products?group=${group}`}>
              {group}
            </Link>
          ))}
        </nav>
      </section>
      <Products />
    </>
  );
}
