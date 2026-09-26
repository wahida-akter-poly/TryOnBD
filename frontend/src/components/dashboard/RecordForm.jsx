import { useState } from 'react';
import { contracts } from '../../services/contracts';
import { useApp } from '../../context/AppContext';
import { useAsync } from '../../hooks/useAsync';
import { Button, ErrorState, Input, PasswordInput, Select, Textarea } from '../common/UI';
import DemoNotice from '../common/DemoNotice';
import { categoryIds, orderStatuses } from '../../utils/format';

const labels = {
  fullName: 'Full name',
  email: 'Email address',
  phone: 'Phone number',
  address: 'Address',
  password: 'Password (never saved locally)',
  businessName: 'Business name',
  contactEmail: 'Contact email',
  subscriptionStatus: 'Demo subscription',
  userId: 'Demo user',
  sellerId: 'Demo seller',
  categoryId: 'Category',
  name: 'Product name',
  price: 'Price (BDT)',
  stockQuantity: 'Stock quantity',
  imageUrl: 'Product image URL',
  categoryName: 'Category name',
  description: 'Description',
  parentCategoryId: 'Parent category',
  orderStatus: 'Order status',
  totalAmount: 'Total amount',
  productId: 'Product',
  inputImageUrl: 'Input image reference',
  tryOnType: 'Try-on type',
  resultImageUrl: 'Result image reference',
  rating: 'Rating',
  comment: 'Comment',
};
const resourceKey = (name) => (name === 'sessions' ? 'try-on-sessions' : name);
export default function RecordForm({ collection, record, defaults = {}, onDone }) {
  const { state, mutate } = useApp();
  const contract = contracts[resourceKey(collection)];
  const fields = record ? contract.update : Object.keys(contract.create);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      fields.map((key) => [
        key,
        (key.endsWith('Url') && record?.[key]?.startsWith('/')
          ? new URL(record[key], window.location.origin).href
          : record?.[key]) ??
          defaults[key] ??
          (key === 'parentCategoryId'
            ? ''
            : key.endsWith('Id')
              ? 1
              : key === 'subscriptionStatus'
                ? 'BASIC'
                : key === 'orderStatus'
                  ? 'PENDING'
                  : key === 'stockQuantity'
                    ? 0
                    : ''),
      ]),
    ),
  );
  const [tryOnType, setTryOnType] = useState(record?.tryOnType || 'CLOTHING');
  const { busy, error, run, setError } = useAsync();
  const options = (key) =>
    key === 'categoryId' || key === 'parentCategoryId'
      ? state.categories
          .filter(
            (c) =>
              !record ||
              collection !== 'categories' ||
              !categoryIds(state.categories, record.id).includes(String(c.id)),
          )
          .map((c) => [c.id, c.categoryName])
      : key === 'sellerId'
        ? state.sellers.map((s) => [s.id, s.businessName])
        : key === 'userId'
          ? state.users.map((u) => [u.id, u.fullName])
          : key === 'productId'
            ? state.products.map((p) => [p.id, p.name])
            : key === 'subscriptionStatus'
              ? [
                  ['BASIC', 'Basic'],
                  ['PREMIUM', 'Premium'],
                ]
              : key === 'orderStatus'
                ? orderStatuses.map((s) => [s, s])
                : key === 'tryOnType'
                  ? ['CLOTHING', 'SUNGLASSES', 'JEWELRY'].map((s) => [s, s])
                  : null;
  function submit(e) {
    e.preventDefault();
    run(async () => {
      const payload = {};
      const localFields = {};
      for (const key of fields) {
        const value = typeof values[key] === 'string' ? values[key].trim() : values[key];
        if (key === 'parentCategoryId' && (value === '' || value === null)) payload[key] = null;
        else if (key.endsWith('Id')) {
          const list =
            key === 'userId'
              ? state.users
              : key === 'sellerId'
                ? state.sellers
                : key === 'productId'
                  ? state.products
                  : state.categories;
          const referenced = list.find((x) => String(x.id) === String(value));
          payload[key] = referenced?.testId || Number(value) || 1;
          localFields[key] = referenced?.id ?? Number(value);
        } else
          payload[key] = ['price', 'stockQuantity', 'totalAmount', 'rating'].includes(key)
            ? Number(value)
            : value;
        if (typeof payload[key] === 'string' && !payload[key]) {
          setError(`${labels[key]} cannot be blank.`);
          return;
        }
      }
      if (collection === 'products') localFields.tryOnType = tryOnType;
      const result = await mutate(
        collection,
        record ? 'update' : 'create',
        payload,
        record,
        localFields,
      );
      if (result.ok) onDone?.(result.record);
      else setError(result.error);
    });
  }
  return (
    <form className="form-stack" onSubmit={submit}>
      <DemoNotice compact />
      {record && (
        <p className="muted text-xs">
          Controller test ID: {record.testId || 1}. Local reference: {record.id}. These are not
          guaranteed persisted IDs.
        </p>
      )}
      <div className="form-grid">
        {fields.map((key) => {
          const opts = options(key);
          const props = {
            label: labels[key] || key,
            value: values[key] ?? '',
            onChange: (e) => setValues((old) => ({ ...old, [key]: e.target.value })),
            required: key !== 'parentCategoryId',
          };
          if (opts)
            return (
              <Select key={key} {...props}>
                {key === 'parentCategoryId' && <option value="">None (root category)</option>}
                {!opts.some(([value]) => String(value) === String(values[key])) &&
                  key !== 'parentCategoryId' && <option value="">Select…</option>}
                {opts.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </Select>
            );
          if (key === 'password')
            return <PasswordInput key={key} {...props} minLength={8} autoComplete="new-password" />;
          if (['description', 'comment', 'address'].includes(key))
            return <Textarea key={key} {...props} />;
          const numeric = ['price', 'stockQuantity', 'totalAmount', 'rating'].includes(key);
          return (
            <Input
              key={key}
              {...props}
              type={
                numeric
                  ? 'number'
                  : key.toLowerCase().includes('email')
                    ? 'email'
                    : key.endsWith('Url')
                      ? 'url'
                      : 'text'
              }
              min={key === 'price' ? '0.01' : key === 'rating' ? 1 : 0}
              max={key === 'rating' ? 5 : undefined}
              step={['price', 'totalAmount'].includes(key) ? '0.01' : numeric ? '1' : undefined}
            />
          );
        })}
      </div>
      {collection === 'products' && (
        <Select
          label="Frontend-only try-on configuration (not sent to Product API)"
          value={tryOnType}
          onChange={(e) => setTryOnType(e.target.value)}
        >
          {['CLOTHING', 'SUNGLASSES', 'JEWELRY'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      )}
      {error && <ErrorState message={error} />}
      <Button type="submit" busy={busy}>
        {record ? 'Save changes' : 'Create demo record'}
      </Button>
    </form>
  );
}
