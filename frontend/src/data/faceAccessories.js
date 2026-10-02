// Frontend-only fitting configuration. Never included in Product API DTOs.
// Set src to a real front-facing transparent PNG/WebP when available.
// Current illustrations are explicitly fallback assets, not product photographs.
// Calibrated against the portrait fixture: 354px face span, 165px eye-center span.
// Visible image width / lens-center separation gives fits .92/.92/.96/.92.
export const sunglassesStyles = [
  {
    id: 'aviator',
    label: 'Classic Aviator',
    src: '/assets/face-ar/sunglasses/aviator-real.png',
    legacySrc: '/assets/overlay-glasses.svg',
    fallbackSrc: null,
    widthMultiplier: 0.92,
    bridgePivot: { x: 0.5, y: 0.42 },
    // Aviator hinges sit beside the lens midline, below its upper double bar.
    hinges: { left: { x: 0.055, y: 0.4 }, right: { x: 0.945, y: 0.4 } },
  },
  {
    id: 'square',
    label: 'Black Square',
    src: null,
    fallbackSrc: '/assets/face-ar/square.png',
    widthMultiplier: 0.92,
  },
  {
    id: 'round',
    label: 'Round Metal',
    src: null,
    fallbackSrc: '/assets/face-ar/round.png',
    widthMultiplier: 0.96,
  },
  {
    id: 'clear',
    label: 'Modern Clear Frame',
    bridgePivot: { x: 0.5, y: 0.43 },
    hinges: { left: { x: 0.025, y: 0.22 }, right: { x: 0.975, y: 0.22 } },
    src: '/assets/face-ar/sunglasses/modern-clear-front-clean.png',
    frontFrameSrc: '/assets/face-ar/sunglasses/modern-clear-front-clean.png',
    leftTempleSrc: '/assets/face-ar/sunglasses/modern-clear-left-temple-normalized.png',
    rightTempleSrc: '/assets/face-ar/sunglasses/modern-clear-right-temple-normalized.png',
    legacySrc: '/assets/face-ar/clear.png',
    fallbackSrc: null,
    widthMultiplier: 0.92,
  },
].map((style) => ({ ...style, verticalOffset: 0.03, rotationOffset: 0, opacity: 100 }));

export const accessoryStyles = [
  ...sunglassesStyles.map((style) => ({
    ...style,
    name: style.label,
    kind: 'sunglasses',
    overlayAsset: style.src || style.fallbackSrc,
  })),
  ...[
    { id: 'pearl', name: 'Pearl Drop', kind: 'earrings' },
    { id: 'gold', name: 'Gold Drop', kind: 'earrings' },
    { id: 'crystal', name: 'Crystal Drop', kind: 'earrings' },
    { id: 'jhumka', name: 'Traditional Jhumka', kind: 'earrings' },
    { id: 'tikka', name: 'Maang Tikka', kind: 'forehead' },
    { id: 'headpiece', name: 'Crystal Headpiece', kind: 'forehead' },
  ].map((style) => ({ ...style, overlayAsset: `/assets/face-ar/${style.id}.png` })),
];

export function sunglassesAssetFor(product, style) {
  const selected = product?.accessoryStyle === style.id;
  const override = selected ? product.tryOnAsset || {} : {};
  // Older local catalogs stored the default fallback as tryOnImageUrl. That
  // inherited URL must not mask a newly configured real photograph in style.src.
  const legacy =
    selected &&
    product.tryOnImageUrl !== style.legacySrc &&
    product.tryOnImageUrl !== style.fallbackSrc &&
    product.tryOnImageUrl !== style.overlayAsset
      ? product.tryOnImageUrl
      : null;
  return {
    // This assembled product must never inherit a stale flat/cartoon override.
    src: style.frontFrameSrc || override.src || legacy || style.src,
    frontFrameSrc: style.frontFrameSrc,
    leftTempleSrc: style.leftTempleSrc,
    rightTempleSrc: style.rightTempleSrc,
    fallbackSrc: style.fallbackSrc,
    fit: {
      bridgePivot: style.bridgePivot,
      hinges: style.hinges,
      widthMultiplier: override.widthMultiplier ?? style.widthMultiplier,
      verticalOffset: override.verticalOffset ?? style.verticalOffset,
      rotationOffset: override.rotationOffset ?? style.rotationOffset,
      opacity: override.opacity ?? style.opacity,
    },
  };
}

export function configureFaceProduct(product) {
  const kind = { 5: 'sunglasses', 8: 'earrings', 9: 'forehead' }[product.categoryId];
  if (!kind) return product;
  const defaultStyle =
    product.categoryId === 8
      ? product.id === 10
        ? 'pearl'
        : 'gold'
      : product.categoryId === 5
        ? product.id === 9
          ? 'square'
          : 'aviator'
        : 'tikka';
  const style =
    accessoryStyles.find((s) => s.id === product.accessoryStyle) ||
    accessoryStyles.find((s) => s.id === defaultStyle);
  return {
    ...product,
    category: { sunglasses: 'Sunglasses', earrings: 'Earrings', forehead: 'Head Jewelry' }[kind],
    tryOnType: 'FACE_AR',
    accessoryKind: kind,
    accessoryStyle: style.id,
    ...(kind === 'sunglasses' && style.src ? { imageUrl: style.src } : {}),
    tryOnImageUrl: product.tryOnImageUrl || style.overlayAsset,
    overlayAsset: style.overlayAsset,
  };
}

export const supportsFaceAR = (product) =>
  Boolean(product?.tryOnType === 'FACE_AR' && product?.overlayAsset);

// Retain saved carts/edits while upgrading the previous demo catalog in place.
export function migrateFaceCatalog(state, seed) {
  return {
    ...state,
    products: [
      ...state.products.map(configureFaceProduct),
      ...seed.products.filter((p) => p.phaseOne && !state.products.some((old) => old.id === p.id)),
    ],
    categories: [
      ...state.categories,
      ...seed.categories.filter(
        (c) => c.id === 9 && !state.categories.some((old) => old.id === c.id),
      ),
    ],
  };
}
