import axios from 'axios';
const normalizeBaseUrl = (value = '') =>
  value
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');

export const api = axios.create({
  baseURL: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
  timeout: 8000,
  headers: { Accept: 'application/json' },
});
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tryonbd:token') || sessionStorage.getItem('tryonbd:token');
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
const publish = (detail) => window.dispatchEvent(new CustomEvent('tryonbd:api', { detail }));
api.interceptors.response.use(
  (response) => {
    publish({ online: true, status: response.status });
    return response;
  },
  (error) => {
    // Vite returns an empty gateway response when its backend target is unreachable.
    const gateway =
      [502, 503, 504].includes(error.response?.status) ||
      (error.response?.status === 500 && !error.response?.data);
    const currentToken =
      localStorage.getItem('tryonbd:token') || sessionStorage.getItem('tryonbd:token');
    if (
      error.response?.status === 401 &&
      currentToken &&
      error.config?.headers?.Authorization === `Bearer ${currentToken}`
    ) {
      for (const storage of [localStorage, sessionStorage]) {
        storage.removeItem('tryonbd:token');
        storage.removeItem('tryonbd:identity');
      }
      window.dispatchEvent(new Event('tryonbd:unauthorized'));
    }
    error.backendOffline = !error.response || gateway;
    publish({ online: !error.backendOffline, status: error.response?.status });
    return Promise.reject(error);
  },
);
export const sendRequest = ({ method, path, data }) => api.request({ method, url: path, data });
export function errorMessage(error) {
  if (error.backendOffline || !error.response)
    return 'The backend is unavailable. Please try again shortly.';
  const body = error.response.data;
  const detail =
    typeof body === 'string'
      ? body
      : body?.message || body?.error || 'The request was rejected. Check the form values.';
  return `HTTP ${error.response.status} — ${detail}`;
}
