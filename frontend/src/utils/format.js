export const money = (value) =>
  `৳${Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
export const date = (value) =>
  new Date(value || Date.now()).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
export const localId = (prefix) =>
  `LOCAL-${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
export function categoryIds(categories, id, seen = new Set()) {
  if (seen.has(String(id))) return [];
  seen.add(String(id));
  return [
    String(id),
    ...categories
      .filter((c) => String(c.parentCategoryId) === String(id))
      .flatMap((c) => categoryIds(categories, c.id, seen)),
  ];
}
export const roles = {
  customer: 'Customer',
  seller: 'Seller',
  admin: 'Admin',
  'super-admin': 'Super Admin',
};
export const orderStatuses = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
