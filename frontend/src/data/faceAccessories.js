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
  const layered = product?.imageUrl === '/assets/face-ar/sunglasses/modern-clear-front-clean.png';
  return {
    src: product?.imageUrl,
    frontFrameSrc: product?.imageUrl,
    leftTempleSrc: layered ? style.leftTempleSrc : null,
    rightTempleSrc: layered ? style.rightTempleSrc : null,
    fallbackSrc: null,
    fit: {
      bridgePivot: style.bridgePivot,
      hinges: style.hinges,
      widthMultiplier: style.widthMultiplier,
      verticalOffset: style.verticalOffset,
      rotationOffset: style.rotationOffset,
      opacity: style.opacity,
    },
  };
}
export const supportsFaceAR = (product) => product?.engine === 'sunglasses';
