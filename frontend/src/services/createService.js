import { api } from './api';
import { contracts, pickPayload } from './contracts';

export function createService(resource) {
  const path = `/api/${resource}`;
  const numericId = (id) => {
    if (!/^\d+$/.test(String(id))) throw new Error('A numeric controller test ID is required.');
    return id;
  };
  return {
    list: () => api.get(path),
    get: (id) => api.get(`${path}/${numericId(id)}`),
    create: (data) => api.post(path, pickPayload(resource, 'create', data)),
    update: (id, data) =>
      api.put(
        `${path}/${numericId(id)}${contracts[resource].suffix || ''}`,
        pickPayload(resource, 'update', data),
      ),
    remove: (id) => api.delete(`${path}/${numericId(id)}`),
  };
}
