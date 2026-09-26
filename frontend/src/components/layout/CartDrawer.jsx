import { Link } from 'react-router-dom';
import { Minus, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Button, Drawer, EmptyState, IconButton, Price } from '../common/UI';
import { ProductImage } from '../product/ProductCard';

export default function CartDrawer() {
  const { state, setState, cartOpen, setCartOpen, cartQuantity } = useApp();
  const lines = state.cart
    .map((item) => ({ ...item, product: state.products.find((p) => p.id === item.productId) }))
    .filter((x) => x.product);
  return (
    <Drawer open={cartOpen} onClose={() => setCartOpen(false)} title={`Your bag (${lines.length})`}>
      <p className="muted text-sm mb-5">Your finds, saved locally in this browser.</p>
      {lines.length ? (
        <>
          <div className="cart-lines">
            {lines.map(({ product, quantity }) => (
              <div className="cart-line" key={product.id}>
                <ProductImage product={product} />
                <div className="min-w-0 flex-1">
                  <Link to={`/products/${product.id}`} onClick={() => setCartOpen(false)}>
                    <h3>{product.name}</h3>
                  </Link>
                  <Price value={product.price} />
                  <div className="quantity">
                    <IconButton
                      label={`Decrease ${product.name}`}
                      onClick={() => cartQuantity(product.id, quantity - 1)}
                    >
                      <Minus size={13} />
                    </IconButton>
                    <span>{quantity}</span>
                    <IconButton
                      label={`Increase ${product.name}`}
                      onClick={() => cartQuantity(product.id, quantity + 1)}
                    >
                      <Plus size={13} />
                    </IconButton>
                  </div>
                </div>
                <IconButton
                  label={`Remove ${product.name}`}
                  onClick={() => cartQuantity(product.id, 0)}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            ))}
          </div>
          <div className="cart-summary">
            <div className="flex justify-between mb-5">
              <strong>Subtotal</strong>
              <Price value={lines.reduce((total, x) => total + x.quantity * x.product.price, 0)} />
            </div>
            <Link
              className="btn btn-primary w-full"
              to="/checkout"
              onClick={() => setCartOpen(false)}
            >
              Continue to checkout
              <ArrowRight size={16} />
            </Link>
            <Button
              variant="ghost"
              className="w-full mt-2"
              onClick={() => setState((old) => ({ ...old, cart: [] }))}
            >
              Clear bag
            </Button>
          </div>
        </>
      ) : (
        <EmptyState
          title="A little room for something new"
          action={
            <Link className="btn btn-primary" to="/products" onClick={() => setCartOpen(false)}>
              Explore the collection
            </Link>
          }
        />
      )}
    </Drawer>
  );
}
