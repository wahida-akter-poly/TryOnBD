// Legacy fitting for existing real eyewear; new product parts/fit arrive through Product API metadata.
// Set src to a real front-facing transparent PNG/WebP when available.
// Current illustrations are explicitly fallback assets, not product photographs.
// Calibrated against the portrait fixture: 354px face span, 165px eye-center span.
// Visible image width / lens-center separation gives fits .92/.92/.96/.92.
export const sunglassesStyles = [
  {
    id: 'aviator',
    label: 'Classic Aviator',
    src: '/assets/products/eyewear/classic-aviator/front.png',
    legacySrc: '/assets/overlay-glasses.svg',
    fallbackSrc: null,
    widthMultiplier: 0.92,
    bridgePivot: { x: 0.5, y: 0.42 },
    // Apertures traced inside this supplied photo's real rims. Sample only
    // unobstructed lens pixels; no replacement photograph or generated asset.
    lensSurface: {
      width: 1900,
      height: 828,
      opacity: 0.88,
      apertures: [
        {
          samples: [
            [590, 340],
            [660, 470],
            [540, 560],
          ],
          outline: [
            [147, 309],
            [159, 274],
            [183, 235],
            [218, 203],
            [248, 184],
            [316, 174],
            [395, 168],
            [490, 169],
            [590, 179],
            [679, 187],
            [745, 199],
            [777, 215],
            [796, 242],
            [813, 297],
            [824, 360],
            [826, 400],
            [821, 439],
            [802, 482],
            [771, 537],
            [741, 588],
            [711, 631],
            [681, 649],
            [610, 660],
            [533, 665],
            [453, 663],
            [375, 652],
            [303, 633],
            [237, 609],
            [215, 593],
            [194, 553],
            [175, 508],
            [160, 450],
            [150, 390],
          ],
        },
        {
          samples: [
            [1300, 340],
            [1240, 470],
            [1360, 560],
          ],
          outline: [
            [1753, 309],
            [1741, 274],
            [1717, 235],
            [1682, 203],
            [1652, 184],
            [1584, 174],
            [1505, 168],
            [1410, 169],
            [1310, 179],
            [1221, 187],
            [1155, 199],
            [1123, 215],
            [1104, 242],
            [1087, 297],
            [1076, 360],
            [1074, 400],
            [1079, 439],
            [1098, 482],
            [1129, 537],
            [1159, 588],
            [1189, 631],
            [1219, 649],
            [1290, 660],
            [1367, 665],
            [1447, 663],
            [1525, 652],
            [1597, 633],
            [1663, 609],
            [1685, 593],
            [1706, 553],
            [1725, 508],
            [1740, 450],
            [1750, 390],
          ],
        },
      ],
      hardware: [
        [
          [797, 423],
          [807, 414],
          [819, 419],
          [826, 430],
          [820, 445],
          [807, 453],
          [797, 445],
        ],
        [
          [1103, 423],
          [1093, 414],
          [1081, 419],
          [1074, 430],
          [1080, 445],
          [1093, 453],
          [1103, 445],
        ],
      ],
    },
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
    templeDepth: 0.76,
    templeSplay: 0.025,
    templeCurve: 0.065,
    templeRootLength: 0.3,
    templeVerticalOffset: -0.008,
    frontalVisibleFraction: 0.07,
    earSeatOffset: -0.018,
    earSeatWeight: 0.9,
    earTargetDepth: 0.32,
    label: 'Modern Clear Frame',
    bridgePivot: { x: 0.5, y: 0.43 },
    hinges: { left: { x: 0.025, y: 0.22 }, right: { x: 0.975, y: 0.22 } },
    src: '/assets/products/eyewear/modern-clear-frame/front.png',
    frontFrameSrc: '/assets/products/eyewear/modern-clear-frame/front.png',
    leftTempleSrc: '/assets/products/eyewear/modern-clear-frame/left-temple.png',
    rightTempleSrc: '/assets/products/eyewear/modern-clear-frame/right-temple.png',
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

// Real product parts keyed by their front asset, never a database ID. Additional
// photographed products resolve persisted arMetadata automatically. This registry
// preserves existing products; imageUrl remains authoritative for the front texture.
export const eyewearAssetManifests = Object.freeze(
  Object.fromEntries(
    sunglassesStyles
      .filter((style) => style.src)
      .map((style) => [
        style.src,
        Object.freeze({
          leftTempleSrc: style.leftTempleSrc ?? null,
          rightTempleSrc: style.rightTempleSrc ?? null,
          fit: Object.freeze({
            bridgePivot: style.bridgePivot,
            hinges: style.hinges,
            widthMultiplier: style.widthMultiplier,
            verticalOffset: style.verticalOffset,
            rotationOffset: style.rotationOffset,
            opacity: style.opacity,
            lensSurface: style.lensSurface,
            templeDepth: style.templeDepth ?? 0.62,
            templeSplay: style.templeSplay ?? 0.04,
            templeCurve: style.templeCurve,
            templeRootLength: style.templeRootLength,
            templeVerticalOffset: style.templeVerticalOffset,
            frontalVisibleFraction: style.frontalVisibleFraction,
            earSeatOffset: style.earSeatOffset,
            earSeatWeight: style.earSeatWeight,
            earTargetDepth: style.earTargetDepth,
          }),
        }),
      ]),
  ),
);

export function sunglassesAssetFor(product, style) {
  const src = product?.imageUrl;
  // Cache query strings do not invalidate local part calibration. Unknown or
  // external product URLs receive their own front only, without substitute arms.
  const key = typeof src === 'string' && src.startsWith('/') ? src.split(/[?#]/)[0] : src;
  const imported = product?.arMetadata;
  // Metadata for an old front must never attach its temples to an edited image.
  const manifest = imported
    ? imported.frontAsset === src
      ? {
          leftTempleSrc: imported.leftTempleAsset,
          rightTempleSrc: imported.rightTempleAsset,
          fit: { ...eyewearAssetManifests[key]?.fit, ...imported.fitProfile },
        }
      : null
    : eyewearAssetManifests[key];
  return {
    src,
    frontFrameSrc: src,
    leftTempleSrc: manifest?.leftTempleSrc ?? null,
    rightTempleSrc: manifest?.rightTempleSrc ?? null,
    fallbackSrc: null,
    fit: {
      bridgePivot: style?.bridgePivot,
      widthMultiplier: style?.widthMultiplier ?? 0.92,
      verticalOffset: style?.verticalOffset ?? 0.03,
      rotationOffset: 0,
      opacity: 100,
      ...manifest?.fit,
    },
  };
}

export const supportsFaceAR = (product) =>
  product?.engine === 'sunglasses' && product?.arAvailable === true;
