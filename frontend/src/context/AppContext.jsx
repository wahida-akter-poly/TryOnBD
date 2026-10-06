import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { services } from '../services';
import { errorMessage } from '../services/api';
import { normalizeProduct } from '../services/catalog';
const Context = createContext(null);
const empty = {
  products: [],
  categories: [],
  cart: [],
  orders: [],
  sessions: [],
  users: [],
  sellers: [],
};
const savedToken = () =>
  localStorage.getItem('tryonbd:token') || sessionStorage.getItem('tryonbd:token');
export function AppProvider({ children }) {
  const [state, setState] = useState(empty),
    [user, setUser] = useState(null),
    [token, setToken] = useState(savedToken),
    [restoring, setRestoring] = useState(!!savedToken());
  const [catalogLoading, setCatalogLoading] = useState(true),
    [catalogError, setCatalogError] = useState(''),
    [accountError, setAccountError] = useState(''),
    [cartOpen, setCartOpen] = useState(false),
    [toasts, setToasts] = useState([]);
  const media = useRef(new Set()),
    generation = useRef(0);
  const role = user?.role?.toLowerCase() || 'customer';
  const identity = user && token ? { userId: user.id, role } : null;
  const toast = (message, type = 'success') =>
    setToasts((old) => [...old.slice(-3), { id: crypto.randomUUID(), message, type }]);
  async function refreshCatalog() {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const [products, categories] = await Promise.all([
        services.products.list(),
        services.categories.list(),
      ]);
      setState((old) => ({
        ...old,
        products: products.data.map(normalizeProduct),
        categories: categories.data,
      }));
    } catch (e) {
      setCatalogError(errorMessage(e));
      setState((old) => ({ ...old, products: [], categories: [] }));
    } finally {
      setCatalogLoading(false);
    }
  }
  async function refreshAccount() {
    const ticket = generation.current;
    setAccountError('');
    try {
      const [cart, orders, sessions] = await Promise.all([
        services.account.cart(),
        services.orders.list(),
        services.sessions.list(),
      ]);
      if (ticket === generation.current)
        setState((old) => ({
          ...old,
          cart: Object.entries(cart.data).map(([id, quantity]) => ({
            productId: Number(id),
            quantity,
          })),
          orders: orders.data,
          sessions: sessions.data,
        }));
    } catch (e) {
      if (ticket === generation.current) setAccountError(errorMessage(e));
      throw e;
    }
  }
  function logout() {
    generation.current++;
    setToken(null);
    setUser(null);
    setAccountError('');
    setState((old) => ({ ...old, cart: [], orders: [], sessions: [] }));
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem('tryonbd:token');
      storage.removeItem('tryonbd:identity');
    }
  }
  function login(_role, remember, _id, nextToken, nextUser) {
    generation.current++;
    for (const storage of [localStorage, sessionStorage]) {
      storage.removeItem('tryonbd:token');
      storage.removeItem('tryonbd:identity');
    }
    (remember ? localStorage : sessionStorage).setItem('tryonbd:token', nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }
  useEffect(() => {
    refreshCatalog();
    window.addEventListener('tryonbd:unauthorized', logout);
    return () => {
      window.removeEventListener('tryonbd:unauthorized', logout);
      media.current.forEach(URL.revokeObjectURL);
    };
  }, []);
  useEffect(() => {
    if (!token) {
      setRestoring(false);
      return;
    }
    let active = true;
    setRestoring(true);
    services.account
      .me()
      .then(({ data }) => {
        if (active) setUser(data);
        return refreshAccount();
      })
      .catch((e) => {
        if (active) setAccountError(errorMessage(e));
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [token]);
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((old) => old.slice(1)), 6000);
    return () => clearTimeout(timer);
  }, [toasts]);
  async function cartQuantity(id, quantity) {
    if (!identity || identity.role !== 'customer') {
      toast('Sign in as a customer to use your cart.', 'error');
      return false;
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      toast('Cart quantity must be a whole number zero or greater.', 'error');
      return false;
    }
    const ticket = generation.current;
    try {
      const { data } = await services.account.quantity(id, quantity);
      if (ticket !== generation.current) return false;
      setState((old) => ({
        ...old,
        cart: Object.entries(data).map(([key, value]) => ({
          productId: Number(key),
          quantity: value,
        })),
      }));
      return true;
    } catch (e) {
      toast(errorMessage(e), 'error');
      return false;
    }
  }
  async function addToCart(product, quantity = 1) {
    if (!identity || identity.role !== 'customer') {
      toast('Sign in as a customer to use your cart.', 'error');
      return false;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > product.stockQuantity) {
      toast('Requested quantity is not available in stock.', 'error');
      return false;
    }
    const ticket = generation.current;
    try {
      const { data } = await services.account.add(product.id, quantity);
      if (ticket !== generation.current) return false;
      setState((old) => ({
        ...old,
        cart: Object.entries(data).map(([id, value]) => ({
          productId: Number(id),
          quantity: value,
        })),
      }));
      toast('Added to cart');
      return true;
    } catch (e) {
      toast(errorMessage(e), 'error');
      return false;
    }
  }
  const registerMedia = (blob) => {
    const url = URL.createObjectURL(blob);
    media.current.add(url);
    return url;
  };
  return (
    <Context.Provider
      value={{
        state,
        setState,
        user,
        token,
        identity,
        role,
        restoring,
        login,
        logout,
        catalogLoading,
        catalogError,
        accountError,
        refreshCatalog,
        refreshAccount,
        cartOpen,
        setCartOpen,
        toasts,
        toast,
        dismissToast: (id) => setToasts((old) => old.filter((t) => t.id !== id)),
        addToCart,
        cartQuantity,
        registerMedia,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
