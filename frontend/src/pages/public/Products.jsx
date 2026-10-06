import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/UI';
import ProductCard from '../../components/product/ProductCard';
export default function Products() {
  const { state, catalogLoading, catalogError, refreshCatalog } = useApp();
  const [params, setParams] = useSearchParams();
  const group = params.get('group') || '',
    category = params.get('category') || '',
    query = params.get('q') || '';
  const engines = { Eyewear: 'sunglasses', Clothing: 'clothing', Jewelry: 'necklace' };
  const products = state.products.filter(
    (p) =>
      (!group ||
        p.engine === engines[group] ||
        state.categories
          .find((c) => c.id === p.categoryId)
          ?.categoryName?.toLowerCase()
          .includes(group.toLowerCase())) &&
      (!category || String(p.categoryId) === category) &&
      p.name.toLowerCase().includes(query.toLowerCase()),
  );
  function change(key, value) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next);
  }
  return (
    <div className="container page">
      <span className="eyebrow">THE COLLECTION</span>
      <h1>{group || 'Shop'}</h1>
      <div className="catalog-controls">
        <input
          aria-label="Search products"
          placeholder="Search products"
          value={query}
          onChange={(e) => change('q', e.target.value)}
        />
        <select
          aria-label="Category"
          value={category}
          onChange={(e) => change('category', e.target.value)}
        >
          <option value="">All categories</option>
          {state.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.categoryName}
            </option>
          ))}
        </select>
      </div>
      {catalogLoading ? (
        <LoadingState />
      ) : catalogError ? (
        <ErrorState message={catalogError} retry={refreshCatalog} />
      ) : products.length ? (
        <div className="product-grid">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No products here yet"
          text="Check another category or return when new products are available."
        />
      )}
    </div>
  );
}
export function Categories() {
  const { state, catalogLoading, catalogError, refreshCatalog } = useApp();
  return (
    <div className="container page">
      <h1>Categories</h1>
      {catalogLoading ? (
        <LoadingState />
      ) : catalogError ? (
        <ErrorState message={catalogError} retry={refreshCatalog} />
      ) : state.categories.length ? (
        <div className="product-grid">
          {state.categories.map((c) => (
            <Link className="panel" key={c.id} to={`/products?category=${c.id}`}>
              <h2>{c.categoryName}</h2>
              <p>{c.description}</p>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No categories yet" />
      )}
    </div>
  );
}
