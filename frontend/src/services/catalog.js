export function arEngine(value) {
  const type = String(value || '')
    .trim()
    .toUpperCase();
  if (['SHIRT', 'TSHIRT', 'CLOTHING'].includes(type)) return 'clothing';
  if (['EYEWEAR', 'SUNGLASSES'].includes(type)) return 'sunglasses';
  if (['NECKLACE', 'JEWELRY'].includes(type)) return 'necklace';
  return null;
}
export function normalizeProduct(product) {
  const engine = arEngine(product.arType);
  return {
    ...product,
    price: Number(product.price),
    stockQuantity: Number(product.stockQuantity ?? 0),
    engine,
    tryOnType:
      engine === 'clothing'
        ? 'CLOTHING'
        : engine === 'sunglasses'
          ? 'FACE_AR'
          : engine === 'necklace'
            ? 'NECKLACE'
            : 'NONE',
    ...(engine === 'clothing' ? { shirtAR: { asset: product.imageUrl } } : {}),
    ...(engine === 'sunglasses'
      ? {
          accessoryKind: 'sunglasses',
          accessoryStyle: /modern-clear-front-clean/.test(product.imageUrl || '')
            ? 'clear'
            : 'aviator',
        }
      : {}),
  };
}
export function imageSource(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const src = value.trim();
  if (/^(https?:\/\/|\/(?!\/)|\.\.?\/)/i.test(src)) return src;
  return null;
}
