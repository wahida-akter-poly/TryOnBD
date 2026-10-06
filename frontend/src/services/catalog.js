import { sunglassesAssetFor, sunglassesStyles } from '../data/faceAccessories.js';

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
    arAvailable: arCapability(product).available,
    tryOnType:
      engine === 'clothing'
        ? 'CLOTHING'
        : engine === 'sunglasses'
          ? 'FACE_AR'
          : engine === 'necklace'
            ? 'NECKLACE'
            : 'NONE',
    ...(engine === 'clothing'
      ? { shirtAR: { ...product.arMetadata?.fitProfile, asset: product.imageUrl } }
      : {}),
    ...(engine === 'sunglasses'
      ? {
          accessoryKind: 'sunglasses',
          accessoryStyle:
            sunglassesStyles.find((style) => style.src === product.imageUrl?.split(/[?#]/)[0])
              ?.id || 'aviator',
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

export function arCapability(product) {
  const engine = arEngine(product?.arType);
  if (!engine || !imageSource(product?.imageUrl)) return { available: false };
  if (engine === 'sunglasses') {
    const assets = sunglassesAssetFor(product);
    return {
      available: Boolean(
        imageSource(assets.frontFrameSrc) &&
        imageSource(assets.leftTempleSrc) &&
        imageSource(assets.rightTempleSrc) &&
        new Set([assets.frontFrameSrc, assets.leftTempleSrc, assets.rightTempleSrc]).size === 3,
      ),
    };
  }
  return { available: true };
}

// Customer images are explicitly listed; AR component URLs are never inferred.
export function productGallerySources(product) {
  const primary = imageSource(product?.imageUrl);
  if (!primary) return [];
  const metadata = product.arMetadata;
  const listed =
    metadata?.frontAsset && metadata.frontAsset !== product.imageUrl
      ? []
      : (metadata?.gallery ?? product.gallery ?? []);
  const images = Array.isArray(listed)
    ? listed
        .slice(0, 12)
        .map((value) => {
          if (typeof value !== 'string') return null;
          if (/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(png|webp|jpe?g)$/i.test(value))
            return primary.slice(0, primary.lastIndexOf('/') + 1) + value;
          return imageSource(value);
        })
        .filter(Boolean)
    : [];
  return [...new Set([primary, ...images])];
}
