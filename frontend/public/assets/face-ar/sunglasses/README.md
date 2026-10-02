# Real sunglasses assets

Put your final front-facing transparent product photographs here, for example:

- `aviator.png`
- `square.webp`
- `round.png`
- `clear.webp`

Real Aviator and Modern Clear Frame photographs are supplied. The other existing vectors/rasterized
illustrations remain explicitly labeled demo fallbacks. Converting a vector to
PNG does not make it a product photograph.

## Modern Clear Frame assembly

The supplied originals are `modern-clear-front.webp`, `modern-clear-side.webp`,
and `modern-clear-3q.webp` (the requested PNG originals were not present).
Run `node scripts/process-modern-clear.mjs` from `frontend` to reproduce:

- `modern-clear-front-clean.png`: original front photograph pixels with studio
  background and the entire lens apertures erased, including the back arms.
- `modern-clear-right-temple.png`: only the visible near arm from the side photo.
- `modern-clear-left-temple.png`: mirrored copy of that same real arm.

Run `node scripts/normalize-modern-clear-temples.mjs` to make the calibrated
`modern-clear-left-temple-normalized.png` and `modern-clear-right-temple-normalized.png`
used by Modern Clear. This applies a rigid rotation of the existing alpha cutouts,
then crops to all nontransparent pixels. It does not straighten the physical hook,
invent texture, or change the front photograph. No new mirror fallback is used;
the preexisting left cutout was already a mirror of the right.

Alpha-weighted PCA measures the original overall axes at -6.557840° (left) and
+6.557840° (right), measured relative to image +X, with image Y pointing down.
The normalized axes are within 0.001° of horizontal. Both PNGs are 1014 × 169.
End-strip alpha centroids identify the original hinge/tip; their exact rigidly
transformed coordinates are stored in `src/data/modernClearTempleCalibration.js`.
The measured hinge-to-tip distance is 989.406731 pixels. Uniform scale is the
requested visible length divided by that distance, independently of PNG width.
The natural hook still places the tip about 4.04° below the overall PCA axis.

Runtime frontal base offsets are -1° on screen left and +1° on screen right,
in addition to the existing parent frame roll. Both projected hinge-to-tip
lengths are 15% of frame width within ±3° of frontal yaw. Smoothstep over
absolute resolved matrix yaw from 3° to 24° grows the near arm to 57.5% and the far
arm to 31%. At 10° they are 26.02% / 19.15%; at 15°, 40.77% / 24.70%;
at 20°, 53.46% / 29.48%.
The existing per-side length/opacity filters and high-yaw far fade remain.
Scaling stays uniform and anchored at the measured hinge pixel. Neither the
normalized assets nor the front/nose geometry were changed for foreshortening.
All transforms use the measured asset hinge pivot. Asset/pivot/axis diagnostics
remain behind `?arDebug=1` and are excluded from capture.

The three-quarter image is only a visual shape/hinge reference. No generated
or illustrated product substitutes are used. Extraction masks are traced in
source-photo coordinates; keep the supplied originals unchanged when rerunning.

`frontFrameSrc`, `leftTempleSrc`, and `rightTempleSrc` load atomically. Modern
Clear Frame has no fallback; an unavailable part disables capture/export and
reports an asset error. Legacy Clear cartoon URLs cannot override this assembly.

The existing face-span scaling and roll transform apply to the entire pair.
The existing matrix-derived yaw controls stable arm projection and opacity.
Pose ears remain optional debug diagnostics and do not position the temples.
Painter order is far arm, one front frame, near arm. Both arms clip strictly
outward of their hinge so they cannot cross the lens openings. Capture and PNG
export use the same composite canvas, without another overlay pass.

Normal: `http://127.0.0.1:5173/try-on?productId=2`
Debug: `http://127.0.0.1:5173/try-on?productId=2&arDebug=1`
Select **Modern Clear Frame** in either mode.

Use a centered, straight-on image with both frame sides visible, transparent
background, and minimal empty padding. Preserve any lens transparency inside
the image. Do not add a white background or a cast shadow around the whole frame.
The loader calculates the nontransparent bounds once and the renderer crops to
those bounds without altering your file. It preserves the cropped aspect ratio
and uses high-quality image smoothing. Entirely transparent/failed images fall
back to the existing illustration.

After copying a file, set `src` in `sunglassesStyles` in
`src/data/faceAccessories.js`:

```js
{
  id: 'aviator',
  label: 'Classic Aviator',
  src: '/assets/face-ar/sunglasses/aviator.png',
  fallbackSrc: '/assets/overlay-glasses.svg',
  widthMultiplier: 0.88,
  verticalOffset: 0.03,
  rotationOffset: 0,
  opacity: 100,
}
```

The shown values are calibrated for the CURRENT illustration and portrait
fixture, not for your future photograph. Adjust the new photograph's profile
after checking the fit at multiple camera distances. No renderer changes needed.

| Field             | Meaning                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `src`             | Real PNG/WebP URL; `null` means no photograph supplied yet                                  |
| `fallbackSrc`     | Existing demo image if the photograph is absent or cannot load                              |
| `widthMultiplier` | Visible frame width / measured face-side width (234 to 454)                                 |
| `verticalOffset`  | Vertical offset as a fraction of face-side width; positive moves down along the tilted face |
| `rotationOffset`  | Extra rotation in degrees, default 0                                                        |
| `opacity`         | Whole-image opacity in percent, default 100; use the image's alpha for lenses               |

Products can override these settings with frontend-only `tryOnAsset`, for example:

```js
tryOnAsset: {
  src: '/assets/face-ar/sunglasses/aero-product.webp',
  widthMultiplier: 0.9, // Calibrate this against the supplied photograph.
  verticalOffset: 0.02,
  rotationOffset: 0,
  opacity: 100,
}
```

An explicit existing `tryOnImageUrl` remains supported. Inherited default demo
URLs in older browser catalogs do not mask a newly configured photograph.
These fields stay out of backend DTOs.

## Distance verification

Run the Vite development server and open
`http://127.0.0.1:5173/try-on?productId=2&arDebug=1`.
Start the camera with **Auto Align** checked and **Scale** at **1**.
In browser DevTools Console, inspect `window.__tryOnScaleDebug`. There is no
continuous console logging; this dev-only object refreshes at most five times
per second and is removed when the source stops/unmounts. It is absent from
production builds.

At 70–80 cm from the webcam, record a copy:

```js
window.farFit = { ...window.__tryOnScaleDebug };
```

Move to 35–40 cm, hold still briefly, then record/compare:

```js
window.nearFit = { ...window.__tryOnScaleDebug };
console.table([window.farFit, window.nearFit]);
```

Check `faceWidthPx`, `eyeDistancePx`, `targetGlassesWidth`,
`smoothedGlassesWidth`, and `displayedGlassesWidth` increase. `userScaleAdjustment`
should stay 1; `productFitMultiplier` should stay constant. The rendered width is
smoothed face width × product fit × user scale, with no distance clamp or use of z.
Returning to the farther position should reduce the widths again. The exact
ratio depends on the actual change in the face's screen-space size.

If the measured spans stay fixed, compare the actual face size in the video and
check camera auto-framing/zoom. If the spans change but the rendered width does
not, keep the two diagnostic copies for debugging. Confirm `autoAlign: true`
and `faceDetected: true`; a captured image or explicit manual placement does not
track distance.
