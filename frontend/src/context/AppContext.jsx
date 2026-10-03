import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { seed } from '../data/mock/seed';
import { services } from '../services';
import { errorMessage } from '../services/api';
import { loadState, saveState } from '../utils/storage';
import { localId } from '../utils/format';
import { configureFaceProduct, migrateFaceCatalog } from '../data/faceAccessories';

const Context = createContext(null);
const normalizeArProduct = (product) => {
  const arType = String(product.arType || '').toUpperCase();
  const base = {
    ...product,
    price: Number(product.price || 0),
    stockQuantity: product.stockQuantity ?? 0,
    fullName: product.fullName || product.name,
  };
  if (arType === 'SHIRT' || arType === 'TSHIRT' || arType === 'CLOTHING') {
    return {
      ...base,
      arType: 'tshirt',
      tryOnType: 'CLOTHING',
      category: 'Clothing',
      shirtAR: { asset: product.imageUrl || '/assets/body-ar/shirts/tshirt-black-front.png' },
    };
  }
  if (arType === 'EYEWEAR' || arType === 'SUNGLASSES') {
    const clear = /clear/i.test(product.name || '');
    const aviator = /aviator/i.test(product.name || '');
    return configureFaceProduct({
      ...base,
      categoryId: product.categoryId || 5,
      tryOnType: 'FACE_AR',
      accessoryKind: 'sunglasses',
      accessoryStyle: clear ? 'clear' : aviator ? 'aviator' : 'aviator',
    });
  }
  return configureFaceProduct(base);
};

export function AppProvider({ children }) {
  const [state, setState] = useState(() => migrateFaceCatalog(loadState(seed), seed));
  const [role, setRole] = useState('customer');
  const [identity, setIdentity] = useState(() => {
    try {
      return JSON.parse(
        localStorage.getItem('tryonbd:identity') ||
          sessionStorage.getItem('tryonbd:identity') ||
          'null',
      );
    } catch {
      return null;
    }
  });
  const [authUser, setAuthUser] = useState(() => identity?.user || null);
  const [token, setToken] = useState(() => localStorage.getItem('tryonbd:token') || sessionStorage.getItem('tryonbd:token') || null);
  const [online, setOnline] = useState(null);
  const [fallback, setFallback] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const storageWarned = useRef(false);
  const mediaUrls = useRef(new Set());
  const registerMedia = (blob) => {
    const url = URL.createObjectURL(blob);
    mediaUrls.current.add(url);
    return url;
  };
  useEffect(
    () => () => {
      mediaUrls.current.forEach((url) => URL.revokeObjectURL(url));
    },
    [],
  );
  const toast = (message, type = 'success') =>
    setToasts((old) => [...old.slice(-3), { id: localId('TOAST'), message, type }]);
  useEffect(() => {
    if (!saveState(state) && !storageWarned.current) {
      storageWarned.current = true;
      toast('Browser storage unavailable. Changes will remain in memory for this visit.', 'error');
    }
  }, [state]);
  useEffect(() => {
    const listener = (event) => setOnline(event.detail.online);
    window.addEventListener('tryonbd:api', listener);
    Promise.all([services.products.list(), services.categories.list()])
      .then(([productsResponse, categoriesResponse]) => {
        const products = productsResponse.data.map(normalizeArProduct);
        const categories = categoriesResponse.data;
        setState((old) => ({
          ...old,
          products,
          categories: categories.length ? categories : old.categories,
        }));
      })
      .catch(() => {});
    return () => window.removeEventListener('tryonbd:api', listener);
  }, []);
  useEffect(() => {
    if (!toasts.length) return;
    const timer = setTimeout(() => setToasts((old) => old.slice(1)), 6000);
    return () => clearTimeout(timer);
  }, [toasts]);
  const user =
    authUser ||
    state.users.find((u) => String(u.id) === String(identity?.userId)) ||
    state.users[0] ||
    seed.users[0];
  function login(demoRole, remember, userId = user.id, authToken = null, nextUser = null) {
    const safeUser = nextUser
      ? { ...nextUser, fullName: nextUser.fullName || nextUser.name || nextUser.email }
      : null;
    const value = { userId, role: demoRole, user: safeUser };
    setRole(demoRole);
    setIdentity(value);
    setAuthUser(safeUser);
    setToken(authToken);
    try {
      localStorage.removeItem('tryonbd:identity');
      sessionStorage.removeItem('tryonbd:identity');
      localStorage.removeItem('tryonbd:token');
      sessionStorage.removeItem('tryonbd:token');
      (remember ? localStorage : sessionStorage).setItem('tryonbd:identity', JSON.stringify(value));
      if (authToken) {
        (remember ? localStorage : sessionStorage).setItem('tryonbd:token', authToken);
      }
    } catch {
      toast('Demo login is in memory only.', 'info');
    }
  }
  function logout() {
    setIdentity(null);
    setAuthUser(null);
    setToken(null);
    try {
      localStorage.removeItem('tryonbd:identity');
      sessionStorage.removeItem('tryonbd:identity');
      localStorage.removeItem('tryonbd:token');
      sessionStorage.removeItem('tryonbd:token');
    } catch {
      /* Storage may be blocked. */
    }
  }
  function localUpdate(collection, record, action = 'update') {
    setState((old) => ({
      ...old,
      [collection]:
        action === 'create'
          ? [...old[collection], record]
          : action === 'delete'
            ? old[collection].filter((x) => x.id !== record.id)
            : old[collection].map((x) => (x.id === record.id ? { ...x, ...record } : x)),
      activity: [
        {
          id: localId('LOG'),
          message: `${action} ${collection} · ${record.sync || 'Local demo'}`,
          date: new Date().toISOString(),
        },
        ...old.activity,
      ].slice(0, 100),
    }));
  }
  async function mutate(collection, action, payload, existing = null, localFields = {}) {
    let sync = 'Controller validated';
    // Demo IDs are only controller test inputs, never claimed database identities.
    const testId = existing?.testId || 1;
    try {
      if (action === 'create') await services[collection].create(payload);
      else if (action === 'update') await services[collection].update(testId, payload);
      else await services[collection].remove(testId);
    } catch (error) {
      if (!(error.backendOffline && fallback)) {
        const message = errorMessage(error);
        toast(message, 'error');
        return { ok: false, error: message };
      }
      sync = 'Local / Unsynced';
    }
    const { password: _password, ...safePayload } = payload || {};
    const record = {
      ...existing,
      ...safePayload,
      ...localFields,
      id: existing?.id || localId(collection.toUpperCase()),
      testId,
      sync,
      date: existing?.date || new Date().toISOString(),
    };
    localUpdate(collection, record, action);
    toast(
      sync === 'Controller validated'
        ? 'HTTP 2xx — controller accepted the request. Demo state updated locally.'
        : 'Backend Offline — saved as Local / Unsynced.',
      sync === 'Controller validated' ? 'success' : 'info',
    );
    return { ok: true, record };
  }
  function addToCart(product, quantity = 1) {
    if (!identity) {
      toast('Please sign in before adding items to your cart.', 'error');
      return false;
    }
    const current = state.cart.find((item) => item.productId === product.id)?.quantity || 0;
    if (product.stockQuantity < current + quantity) {
      toast('This quantity is unavailable in demo stock.', 'error');
      return false;
    }
    setState((old) => ({
      ...old,
      cart: current
        ? old.cart.map((item) =>
            item.productId === product.id ? { ...item, quantity: item.quantity + quantity } : item,
          )
        : [...old.cart, { productId: product.id, quantity }],
    }));
    toast('Added to your local cart');
    return true;
  }
  function cartQuantity(id, quantity) {
    const product = state.products.find((p) => p.id === id);
    if (quantity > (product?.stockQuantity || 0)) {
      toast('No more demo stock available.', 'error');
      return;
    }
    setState((old) => ({
      ...old,
      cart:
        quantity < 1
          ? old.cart.filter((x) => x.productId !== id)
          : old.cart.map((x) => (x.productId === id ? { ...x, quantity } : x)),
    }));
  }
  const toggleWishlist = (id) =>
    setState((old) => ({
      ...old,
      wishlist: old.wishlist.includes(id)
        ? old.wishlist.filter((x) => x !== id)
        : [...old.wishlist, id],
    }));
  return (
    <Context.Provider
      value={{
        state,
        setState,
        role,
        setRole,
        user,
        identity,
        token,
        login,
        logout,
        online,
        fallback,
        setFallback,
        cartOpen,
        setCartOpen,
        toast,
        toasts,
        dismissToast: (id) => setToasts((old) => old.filter((t) => t.id !== id)),
        mutate,
        localUpdate,
        addToCart,
        cartQuantity,
        toggleWishlist,
        registerMedia,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useApp = () => useContext(Context);
