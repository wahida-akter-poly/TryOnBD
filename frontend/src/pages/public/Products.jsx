import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X, ArrowUpRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { categoryIds, money } from '../../utils/format';
import {
  Breadcrumbs,
  Button,
  Drawer,
  EmptyState,
  Pagination,
  SearchInput,
  Select,
} from '../../components/common/UI';
import ProductCard from '../../components/product/ProductCard';

export function CategoryTree({ categories, parent = null, value, onSelect, visited = [] }) {
  return (
    <ul className="category-tree">
      {categories
        .filter((c) => String(c.parentCategoryId) === String(parent) && !visited.includes(c.id))
        .map((c) => (
          <li key={c.id}>
            <button
              className={String(value) === String(c.id) ? 'selected' : ''}
              onClick={() => onSelect(String(c.id))}
            >
              {c.categoryName}
              <span>↗</span>
            </button>
            <CategoryTree
              categories={categories}
              parent={c.id}
              value={value}
              onSelect={onSelect}
              visited={[...visited, c.id]}
            />
          </li>
        ))}
    </ul>
  );
}
export default function Products() {
  const { state } = useApp();
  const [params, setParams] = useSearchParams();
  const [maxPrice, setMaxPrice] = useState(6000);
  const [rating, setRating] = useState('0');
  const [mode, setMode] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [page, setPage] = useState(1);
  const query = params.get('q') || '';
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'featured';
  const update = (key, value) => {
    setParams((old) => {
      value ? old.set(key, value) : old.delete(key);
      return old;
    });
    setPage(1);
  };
  const products = useMemo(() => {
    const ids = category ? categoryIds(state.categories, category) : [];
    return state.products
      .filter(
        (p) =>
          (!query || p.name.toLowerCase().includes(query.toLowerCase())) &&
          (!category || ids.includes(String(p.categoryId))) &&
          p.price <= maxPrice &&
          (p.rating || 0) >= Number(rating) &&
          (!mode || p.tryOnType === mode),
      )
      .sort((a, b) =>
        sort === 'price-asc'
          ? a.price - b.price
          : sort === 'price-desc'
            ? b.price - a.price
            : sort === 'rating'
              ? (b.rating || 0) - (a.rating || 0)
              : sort === 'newest'
                ? new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)
                : Number(Boolean(b.badge)) - Number(Boolean(a.badge)),
      );
  }, [state.products, state.categories, query, category, maxPrice, rating, mode, sort]);
  const reset = () => {
    setParams({});
    setMaxPrice(6000);
    setRating('0');
    setMode('');
    setPage(1);
  };
  const filters = (
    <>
      <div className="flex justify-between items-center mb-5">
        <h3>Refine your edit</h3>
        <button className="text-link text-xs" onClick={reset}>
          Reset
        </button>
      </div>
      <SearchInput
        value={query}
        onChange={(e) => update('q', e.target.value)}
        placeholder="Search the collection"
      />
      <h4 className="filter-title">Collections</h4>
      <button
        className={`all-categories ${!category ? 'selected' : ''}`}
        onClick={() => update('category', '')}
      >
        All collections
      </button>
      <CategoryTree
        categories={state.categories}
        value={category}
        onSelect={(id) => update('category', id)}
      />
      <div className="filter-block">
        <label htmlFor="max-price">
          Price up to <strong>{money(maxPrice)}</strong>
        </label>
        <input
          id="max-price"
          type="range"
          min="500"
          max="6000"
          step="100"
          value={maxPrice}
          onChange={(e) => {
            setMaxPrice(Number(e.target.value));
            setPage(1);
          }}
        />
        <span className="flex justify-between text-xs muted">
          <span>৳500</span>
          <span>৳6,000</span>
        </span>
      </div>
      <Select
        label="Minimum rating"
        value={rating}
        onChange={(e) => {
          setRating(e.target.value);
          setPage(1);
        }}
      >
        <option value="0">All ratings</option>
        <option value="4">4 stars & up</option>
        <option value="4.5">4.5 stars & up</option>
        <option value="4.8">4.8 stars & up</option>
      </Select>
      <Select
        label="Try-on mode"
        value={mode}
        onChange={(e) => {
          setMode(e.target.value);
          setPage(1);
        }}
      >
        <option value="">All experiences</option>
        <option value="CLOTHING">Clothing prototype</option>
        <option value="SUNGLASSES">Sunglasses overlay</option>
        <option value="JEWELRY">Jewelry overlay</option>
      </Select>
    </>
  );
  const pages = Math.max(1, Math.ceil(products.length / 8));
  const current = Math.min(page, pages);
  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: query ? 'Search results' : 'The collection' }]} />
      <div className="page-heading">
        <span className="eyebrow">CONSIDERED PIECES. ENDLESS POSSIBILITIES.</span>
        <h1>{query ? `Find your “${query}”` : 'The collection.'}</h1>
        <p>Local inspiration. Everyday elegance. A little something that feels like you.</p>
      </div>
      <div className="catalog-layout">
        <aside className="catalog-filters">{filters}</aside>
        <section className="min-w-0">
          <div className="catalog-toolbar">
            <span>{products.length} thoughtfully curated pieces</span>
            <Button variant="secondary" className="mobile-filter" onClick={() => setDrawer(true)}>
              <SlidersHorizontal size={16} />
              Filters
            </Button>
            <Select label="Sort by" value={sort} onChange={(e) => update('sort', e.target.value)}>
              <option value="featured">Our favorites</option>
              <option value="newest">Newest first</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="rating">Top rated</option>
            </Select>
          </div>
          {products.length ? (
            <>
              <div className="product-grid catalog-grid">
                {products.slice((current - 1) * 8, current * 8).map((p) => (
                  <ProductCard product={p} key={p.id} />
                ))}
              </div>
              <Pagination page={current} pages={pages} onChange={setPage} />
            </>
          ) : (
            <EmptyState
              title="No pieces match this edit"
              description="A different filter might reveal your next favorite."
              action={<Button onClick={reset}>Reset filters</Button>}
            />
          )}
        </section>
      </div>
      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Filter the collection">
        {filters}
        <Button className="w-full mt-6" onClick={() => setDrawer(false)}>
          Show {products.length} pieces
        </Button>
      </Drawer>
    </div>
  );
}
export function Categories() {
  const { state } = useApp();
  return (
    <div className="container page">
      <Breadcrumbs items={[{ label: 'Collections' }]} />
      <div className="page-heading">
        <span className="eyebrow">FIND YOUR POINT OF VIEW</span>
        <h1>A collection for every side of you.</h1>
        <p>Explore the branches of Bangladeshi-inspired style.</p>
      </div>
      <div className="categories-layout">
        <aside className="panel p-6">
          <h3>Explore the family</h3>
          <CategoryTree
            categories={state.categories}
            onSelect={(id) => {
              window.location.href = `/products?category=${id}`;
            }}
          />
        </aside>
        <div className="collection-grid">
          {state.categories
            .filter((c) => c.id !== 1)
            .map((c) => (
              <Link to={`/products?category=${c.id}`} key={c.id} className="collection-tile">
                <span className="eyebrow">THE {c.categoryName.toUpperCase()} EDIT</span>
                <h2>
                  {c.categoryName}
                  <ArrowUpRight />
                </h2>
                <p>{c.description}</p>
                <small>
                  {
                    state.products.filter((p) =>
                      categoryIds(state.categories, c.id).includes(String(p.categoryId)),
                    ).length
                  }{' '}
                  pieces to discover
                </small>
              </Link>
            ))}
        </div>
      </div>
    </div>
  );
}
