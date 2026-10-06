import { api } from './api';
const resource = (path) => ({
  list: () => api.get(path),
  get: (id) => api.get(`${path}/${id}`),
  create: (data) => api.post(path, data),
  update: (id, data) => api.put(`${path}/${id}`, data),
  remove: (id) => api.delete(`${path}/${id}`),
});
export const services = {
  products: resource('/api/products'),
  categories: resource('/api/categories'),
  users: resource('/api/users'),
  sellers: resource('/api/sellers'),
  sessions: resource('/api/try-on-sessions'),
  orders: {
    ...resource('/api/orders'),
    update: (id, data) => api.put(`/api/orders/${id}/status`, data),
  },
  auth: {
    login: (data) => api.post('/api/auth/login', data),
    register: (data) => api.post('/api/auth/register', data),
  },
  account: {
    me: () => api.get('/api/account/me'),
    cart: () => api.get('/api/account/cart'),
    add: (id, quantity) => api.post(`/api/account/cart/${id}`, { quantity }),
    quantity: (id, quantity) => api.put(`/api/account/cart/${id}`, { quantity }),
    checkout: () => api.post('/api/account/checkout'),
    seller: () => api.get('/api/account/seller'),
    products: () => api.get('/api/account/products'),
  },
};
