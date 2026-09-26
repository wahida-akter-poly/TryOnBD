// These are the existing Spring Boot DTOs. Frontend-only fields never cross this boundary.
export const contracts = {
  users: {
    label: 'User',
    create: {
      fullName: 'Ayesha Rahman',
      email: 'ayesha@example.com',
      password: 'DemoPass123',
      phone: '01712345678',
      address: 'Dhanmondi, Dhaka',
    },
    update: ['fullName', 'email', 'phone', 'address'],
  },
  sellers: {
    label: 'Seller',
    create: {
      userId: 1,
      businessName: 'Dhaka Loom',
      contactEmail: 'hello@dhakaloom.example',
      phone: '01812345678',
      subscriptionStatus: 'BASIC',
    },
    update: ['businessName', 'contactEmail', 'phone', 'subscriptionStatus'],
  },
  products: {
    label: 'Product',
    create: {
      sellerId: 1,
      categoryId: 4,
      name: 'Dhaka Loom Panjabi',
      price: 2490,
      stockQuantity: 24,
      imageUrl: 'https://example.com/panjabi.jpg',
    },
    update: ['categoryId', 'name', 'price', 'stockQuantity', 'imageUrl'],
  },
  categories: {
    label: 'Category',
    create: {
      categoryName: 'Panjabi',
      description: 'Contemporary heritage wear',
      parentCategoryId: null,
    },
    update: ['categoryName', 'description', 'parentCategoryId'],
  },
  'try-on-sessions': {
    label: 'Try-On Session',
    create: {
      userId: 1,
      productId: 1,
      inputImageUrl: 'https://example.com/person.jpg',
      tryOnType: 'CLOTHING',
    },
    update: ['resultImageUrl'],
    updateExample: { resultImageUrl: 'https://example.com/result.jpg' },
    suffix: '/result',
  },
  reviews: {
    label: 'Review',
    create: { userId: 1, productId: 1, rating: 5, comment: 'Beautiful fabric and a lovely fit.' },
    update: ['rating', 'comment'],
  },
  orders: {
    label: 'Order',
    create: { userId: 1, totalAmount: 2490, orderStatus: 'PENDING' },
    update: ['orderStatus'],
    suffix: '/status',
  },
};

export function pickPayload(resource, action, data) {
  const fields =
    action === 'create' ? Object.keys(contracts[resource].create) : contracts[resource].update;
  return Object.fromEntries(
    fields.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]),
  );
}

export function normalizeBaseUrl(value = '') {
  return value
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');
}

export const endpoints = Object.entries(contracts).flatMap(([resource, contract]) => [
  { resource, method: 'GET', path: `/api/${resource}`, name: 'List all' },
  { resource, method: 'GET', path: `/api/${resource}/{id}`, name: 'Get by ID' },
  { resource, method: 'POST', path: `/api/${resource}`, name: 'Create', example: contract.create },
  {
    resource,
    method: 'PUT',
    path: `/api/${resource}/{id}${contract.suffix || ''}`,
    name: 'Update',
    example: contract.updateExample || pickPayload(resource, 'update', contract.create),
  },
  { resource, method: 'DELETE', path: `/api/${resource}/{id}`, name: 'Delete' },
]);
