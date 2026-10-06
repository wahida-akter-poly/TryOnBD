# Eyewear temple fitting and camera acceptance

Worktree: `E:\AOOP\TryOnBD-PRODUCTION`.
Branch: `feature/eyewear-temple-3d-fix`.

## What was wrong

Modern Clear's genuine temple PNGs load successfully. Each normalized side image is 1014 x 169, with 53,924 visible pixels, 49,831 opaque pixels and mean visible alpha 0.9533. No artwork or image paths were replaced.

The previous shader discarded every temple fragment projected inward from its hinge. A backward shaft naturally projects inward with perspective, so the screen-space half-plane rule removed legitimate root/shaft pixels before depth could decide visibility. The old fixed shallow splay did not estimate the head-side cross-section. Frontal browser checks accepted just 70/74 temple pixels and checked no minimum root visibility. Far-side opacity also dropped to 0.21 at 30 degrees, hiding fitting errors. The old controlled tests turned the glasses over an unchanged frontal face mesh.

## Current geometry and tracking

This is WebGL 3D projection of genuine photographed surfaces, with curved textured ribbons and a depth buffer. It is not a volumetric manufacturer CAD/GLTF model.

- The shared Face Landmarker remains the only detector in normal eyewear use. Its validated column-major transformation matrix supplies yaw, pitch and roll. Selfie mirroring is applied once. Existing matrix spike handling and landmark-only orientation fallback remain.
- Nose-root landmarks 6/168 anchor the bridge; eye corners 33/133/362/263 provide fallback eye-line roll. Face sides 234/454 determine scale. The existing recovery of physical width from foreshortened face width is preserved.
- Lateral oval groups 127/234/93 and 356/454/323 are transformed back into head-local axes. Robust aggregates estimate lateral radius and depth. These are skull-side proxies, not literal ear landmarks. Invalid mesh dimensions use conservative shared defaults.
- Each temple has four control points: its exact frame hinge, a short proximal wrap, a side-head cross-section, and a posterior/ear-direction target. Three cubic lateral segments recede monotonically in depth. Sixteen textured strips preserve the supplied shaft and ear-hook photography. The proximal movement is predominantly backward, rather than a lateral open wing.
- Front, hinges, both ribbons and the posterior head proxy use the same root rotation, translation, scale and pinhole camera. Hinge positions come from the front plane itself. The measured alpha-weighted hinge of each PNG maps exactly to that position. The left photograph has its hinge at its right edge; the right photograph has its hinge at its left edge. No sprite flipping or independent temple rotation is introduced.
- Both temples retain their original texture alpha and equal assembly opacity. Frontal visibility comes from the short fitted wrap. Yaw exposes the near shaft while real depth increasingly hides the far shaft. There is no per-side yaw fade or forced-visibility override.
- Root orientation and aggregated head dimensions share a frame-rate-independent EMA: 90 ms at rest, approaching 45 ms for larger turns. Existing bridge/width/roll filters remain. Temples have no separate lagging filter. Existing 150 ms tracking-loss hold and 120 ms fade remain coherent across the assembly.

## Depth and transparency

1. The observed 468-vertex facial mesh writes opaque depth only. A lightweight 8 x 24 posterior ellipsoid closes the open facial mesh at the sides/back. Its width/depth are derived from the same head estimate; its frontal extent remains behind the bridge in frontal pose. This is an anatomical approximation, without ear/hair segmentation.
2. Enclosed lens openings are measured once from the actual front PNG alpha. Exterior transparency is flood-filled away. Only those openings write an additional front-plane depth mask, so incomplete eye tessellation cannot reveal a temple through a clear lens. Hinge/root neighborhoods are not part of this mask.
3. Far and near photographic ribbons render against that depth, followed by the real front. All product surfaces retain depth testing (`LEQUAL`). No front-frame depth bypass remains. Homogeneous projection and camera near/far depth are consistent across product and occluder surfaces.
4. Textures upload with premultiplied alpha and blend with `ONE, ONE_MINUS_SRC_ALPHA`. The existing 0.01 alpha discard remains. Transparent product surfaces do not write depth: faint/antialiased texels cannot block another product surface. Opaque occluders write depth normally.

The Canvas fallback reuses the same projected ribbons and measured lens outlines, with conservative far-side head-contour clipping. It supports photo/video and export but cannot provide WebGL's per-pixel 3D head occlusion.

## Modern Clear calibration

Coordinates refer to visible front alpha bounds; dimensions refer to recovered physical frame width.

```json
{
  "widthMultiplier": 0.92,
  "bridgePivot": { "x": 0.5, "y": 0.43 },
  "hinges": {
    "left": { "x": 0.025, "y": 0.22 },
    "right": { "x": 0.975, "y": 0.22 }
  },
  "templeDepth": 0.62,
  "templeSplay": 0.025,
  "templeCurve": 0.065,
  "templeRootLength": 0.18,
  "templeVerticalOffset": 0.012
}
```

Modern Clear now uses standardized package URLs with the same original image bytes:

- `/assets/products/eyewear/modern-clear-frame/front.png`
- `/assets/products/eyewear/modern-clear-frame/left-temple.png`
- `/assets/products/eyewear/modern-clear-frame/right-temple.png`

Product 2 now persists this calibration and the complete part paths through its standardized product manifest. The compatibility registry is keyed by front URL, never database ID. Camera distance remains automatically estimated unless a supported fit override is supplied. See [the catalog migration record](CATALOG_ASSET_NORMALIZATION.md).

## Two future eyewear packages

Both new products use exactly the same renderer. Create `frontend/public/assets/products/eyewear/<slug>/`, provide `front.png`, `left-temple.png`, `right-temple.png` and the existing business `product.json`, then run `npm run sync:products` from `frontend`. See [PRODUCT_ASSET_GUIDE.md](PRODUCT_ASSET_GUIDE.md) for business fields, seller ownership and safe idempotent sync.

Add the measured fitting object above under `fitProfile`, adjusting it for the genuine product. All fields are optional; shared defaults exist. Backend validation now also accepts `templeCurve` (0.02-0.12), `templeRootLength` (0.08-0.30) and `templeVerticalOffset` (-0.08..0.08). Existing `templeDepth`, `templeSplay`, bridge, hinge, width and camera fields are preserved. Metadata stays in the existing product JSON field: no entity/table/schema expansion or second importer.

Supply transparent PNGs with intact alpha, no baked background or rear-arm reflections in the lens openings, and no clipped hinge/ear hook. Side cutouts should be horizontal, showing the actual outside photographic material. For the renderer's left asset, the hinge is on the image's right; for its right asset, the hinge is on the image's left. Empty or incorrect side images cannot be replaced with another product's arms. Classic Aviator remains browsable and unavailable for AR because it lacks genuine complete temples.

## Automated and visual evidence

```powershell
Set-Location E:\AOOP\TryOnBD-PRODUCTION\backend
.\gradlew.bat test --no-daemon
Set-Location E:\AOOP\TryOnBD-PRODUCTION\frontend
npm test
npm run build
npm run test:production
npm run test:live
```

Resumption verification: 156 frontend unit tests, 32 production browser tests and 3 read-only live browser tests pass. The Vite production build succeeds. Gradle reports the backend tests up to date; the existing XML reports contain 41 passing tests with zero failures/errors. Changed-file formatting and `git diff --check` pass.

Checks include rigid hinge attachment under yaw/pitch/roll/scale, coherent narrow/wide head fitting, handed texture mapping, original asset hashes, robust head-side estimates, smoothing/loss behavior, real lens aperture extraction and three independently calibrated package manifests. Backend tests persist the new eyewear metadata through the existing idempotent sync and reject unsafe calibration.

The eight deterministic visual fixtures use a real detected portrait mesh. The face photograph is projected onto its posed triangles and both observed head geometry and eyewear turn together. They are controlled projections, **not photographs of real head turns**. Temple-only rendering isolates the genuine side textures for alpha/visibility measurements. A separate render without lens masking tests actual head-depth suppression, and a render without head occlusion provides the visibility denominator. Tests also protect front-frame coverage and test photo export, explicit debug gating, Canvas fallback and simulated mirrored video capture/teardown. Live tests use the existing PostgreSQL-backed products without writing catalog/cart/account data.

Reference controlled-pose measurements (pixels with alpha >= 20):

| Pose        | Left temple | Right temple | Far visible / unobstructed | Hinge error | Lens intrusion |
| ----------- | ----------: | -----------: | -------------------------: | ----------: | -------------: |
| Frontal     |         329 |          347 |         Both roots visible |           0 |              0 |
| -15 degrees |         178 |          896 |                      41.0% |           0 |              0 |
| +15 degrees |         801 |          189 |                      43.4% |           0 |              0 |
| -30 degrees |         192 |         1409 |                      23.8% |           0 |              0 |
| +30 degrees |        1325 |          211 |                      26.4% |           0 |              0 |

Roll 10 degrees and pitch +/-10 degrees also keep both roots visible with zero hinge separation/lens intrusion. Pixel counts can vary slightly with browser/GPU rasterization; assertions use geometric bounds and meaningful visibility thresholds rather than exact screenshot equality.

Ignored review artifacts are under `frontend/artifacts/`: `eyewear-head-side-{frontal,left-15,left-30,right-15,right-30,roll,up,down}.png`, `eyewear-production-capture.png` and `live-ar-product-2-capture.png`. Inspect the actual rendered output, including the full production photo, before accepting a physical-camera fit.

## Physical-camera review

A physical webcam has **not** been exercised by the automated checks. No final claim of physical realism is made. Manufacturer volume, anatomical ears, hair occlusion, low-light tracking and a varied-person turning video remain limitations. Extreme yaw/pitch still uses the existing 65/40 degree bounds. Canvas depth is approximate.

Start the existing backend and frontend, open `/try-on?productId=2`, then choose Camera. For developer diagnostics only, use `/try-on?productId=2&arDebug=1`: hinge markers, the actual projected curved centerlines, targets and head-fit data are exposed without entering exports/customer UI.

1. Hold frontal for two seconds. Confirm both short roots touch the hinges, neither fully vanishes, and neither forms an open wing.
2. Slowly turn left to about 15, then 30 degrees; hold each. Repeat right. The near shaft should follow the side of the head, the far shaft should occlude, and neither should cross a clear lens.
3. Cross frontal repeatedly in both directions, then make a quicker moderate turn. Check for sudden disappearance, independent temple wobble or a detached frame.
4. Tilt left/right about 10 degrees, then look up/down about 10 degrees. Combine a slight tilt with a 15-degree turn. Check both 3D hinge connections and vertical fit.
5. Move from roughly 70 cm to 45 cm and back, then translate left/right. Frame and temple dimensions should change together. Repeat with a narrower/wider face if available.
6. Briefly leave the camera view, then return. Verify coherent hold/fade and reacquisition. Capture and download; the saved result should match the displayed assembly.

For local startup, use the existing PostgreSQL credentials:

```powershell
Set-Location E:\AOOP\TryOnBD-PRODUCTION\backend
$env:DB_URL = 'jdbc:postgresql://127.0.0.1:5433/tryonbd'
$env:DB_USERNAME = '<your PostgreSQL user>'
$env:DB_PASSWORD = '<your PostgreSQL password>'
.\gradlew.bat bootRun
```

In a second terminal:

```powershell
Set-Location E:\AOOP\TryOnBD-PRODUCTION\frontend
npm run dev
```

This change is isolated to eyewear geometry/rendering/debugging/tests/docs and the required eyewear fit-metadata validator. Product business data, incoming images, Shirt/Necklace engines, authentication, cart/orders and management implementation remain untouched.

## Final shared temple fix (Golden Frame and Modern Clear)

The final renderer keeps the matrix-driven rigid root, WebGL face/skull depth prepass, premultiplied alpha, 0.01 alpha discard and tracking-loss policy. Temple opacity stays 1. No model was trained or fine-tuned.

The previous source mapping divided by horizontal hinge-to-tip distance. Vertical/rotated photographs could collapse or skew, and the hook could bias the shaft orientation. Source pixels now normalize once on load into their measured shaft basis. There is no filename-based Modern Clear calibration lookup. Optional `fitProfile.templeSourceAnchors` specifies each part's `hinge`, `tip` and optional `shaft` reference in full-PNG normalized coordinates. `shaft` is a point on the straight proximal shaft, not the curved ear hook. It defines orientation while `tip` still defines full longitudinal length. Left and right are loaded separately from their actual product paths.

The mesh includes explicit columns at the photographed hinge and path knots, in addition to its 16 regular subdivisions (at most 20 strips). Both WebGL UVs and Canvas source triangles use those same columns. The hinge seam remains exact under perspective, yaw, pitch and roll. A small curved root wrap travels backward in depth; the side section cannot fold inward before clearing that wrap. Both sides share the root and its filtered head dimensions.

Live tracking previously spread the new raw camera-space face mesh onto a smoothed eyewear root. On head turns that mask could overtake the hinges. The face surface is now unrotated into head-local coordinates, its residual shape filters at 80 ms, and it is rotated into the same filtered root orientation. Face contour and depth therefore move with the assembly. Root orientation, scale, bridge smoothing and loss hold/fade remain as before. Physical head/face depth and measured lens apertures determine visibility, rather than independent temple yaw fades.

Opaque tinted front photographs can provide `fitProfile.lensSurface`: full image `width`/`height`, two `apertures` with source-pixel `outline` and `samples`, optional `hardware` polygons and material `opacity` (0.1?1). The existing lens material sampler takes colour from the genuine image and removes baked rear-arm reflections in AR; a matching aperture depth mask prevents projected arms appearing within lenses. Original catalog pixels and nose-pad hardware remain preserved. This changes lens material alpha, never temple opacity.

Golden Frame uses the same engine. Its complete approved metadata is in [product.json](frontend/public/assets/products/eyewear/golden-frame/product.json). Physical fit: width 0.98, bridge (0.5, 0.3), hinges (0.028, 0.333)/(0.970, 0.333), depth 0.62, splay 0.025, curve 0.055, root fraction 0.20, drop 0.016, temple opacity 100%. The straight-shaft source references correct the angled source photographs. Modern Clear's product row and manifest remain unchanged.

Golden's transparent front/left/right PNGs are deterministic cutouts from the user-approved `front_1.png`, `angle_1.png` and `side_1.png`, with no generated artwork. The left visible shaft comes from the angled photograph; the right comes from the side photograph. The left is horizontally aligned into the renderer's left-side convention. Parts hidden in the photographs were not reconstructed. `source-masks.json` records the polygons and alignment. Reproduce from production root with:

```powershell
node frontend/scripts/prepare-eyewear-cutouts.mjs frontend/public/assets/products/eyewear/golden-frame/source-masks.json
```

Original SHA-256 values:

- front_1.png: `0a4b4b5eabbbedce5a2c51239f865b2a9e8bb4ed48ba6e49cfdf869216d23318`
- angle_1.png: `4a1ddc65cb462cacb882fb41104799f61b9c302210fd098a1a2b58cae8f057dc`
- side_1.png: `bdb01618e8fad1855bb2acf5f697e1ce45b0847de5e367142715dfbe564475d6`

Golden Frame imported through `npm run sync:products` as ID 6, seller 2/Anzara, category 2/Eyewear, price 2199, stock 15. Repeated sync keeps ID 6. API snapshots confirm products 1?5 unchanged. All three cutouts pass the existing transparent/visible PNG validation. User-requested Classic Aviator source deletions remain untouched; tests requiring its missing package/image still fail and are reported separately.

Verification adds actual photographic-pixel pose fixtures for both complete products, texture-seam attachment tests, 36 moving-pose/rotated-source pixel checks, source-axis validation, sync idempotency, live backend catalog/details/try-on flows, isolated commerce and role-management UI tests, and backend transactional commerce/management tests using Golden's real manifest. Live catalog tests do not create orders or change real stock. Generated captures are ignored under `frontend/artifacts/`.

Physical webcam realism is still awaiting manual review. Open `/try-on?productId=6` and `/try-on?productId=2` with Camera. Test frontal, slow left/right turns, 15 and 20?30 degree yaw, left/right roll, slight upward/downward pitch, closer/farther movement, and quick left-centre-right reversals. Check that both small roots stay joined, the near arm follows the head, the far arm partially occludes and neither crosses a lens. Also briefly leave/re-enter view and compare a saved capture. Ear positions and hair are estimated rather than measured; photographic strips cannot recover a manufacturer's full solid geometry.

## Frontal visibility and upper ear seating

The shared rig now derives a seat height from the median of upper lateral oval vertices 127/162/234 and 356/389/454, after removing yaw and pitch. This height filters with the existing head dimensions. The photographed hinges and front projection remain unchanged. The shaft approaches the measured upper side rather than inheriting a downward hinge offset. Its final vertical target, including product calibration, is bounded to 0.01–0.08 frame widths above the hinge; `earSeatWeight` blends that target with hinge height. This also bounds older positive-drop API profiles.

The previous proximal wrap used only `templeCurve * 0.7`; perspective contracted that small section and the posterior path folded inward by `templeCurve * 1.4`. Front-frame overlap and head depth could therefore leave only a tiny visible temple section. `frontalVisibleFraction` now defines a minimum projected outward root wrap in units of physical frame width, compensating for perspective in head coordinates. It is geometry, not a visibility/opacity override. The posterior path follows the skull radius with a gentler `templeCurve * 0.4` inset.

WebGL still depth-tests every part against the actual face, posterior skull and measured lens apertures; temple opacity remains 1. Near/far exposure emerges continuously from the shared pose and depth. Canvas fallback applies the far-side silhouette to posterior strips only, preserving the exact proximal hinge seam while retaining lens clipping. Canvas head occlusion remains an approximation.

The backend metadata validator accepts three additional eyewear-only values: `frontalVisibleFraction` (0.02–0.075), `earSeatOffset` (-0.08–0.08 frame widths), and `earSeatWeight` (0–1). API metadata remains authoritative. For known legacy front assets, missing fit values inherit their existing asset calibration; unrelated/external URLs do not acquire substitute temples.

Final package calibration:

| Parameter | Modern Clear Frame | Golden Frame |
| --- | --- | --- |
| Front width multiplier | 0.92 | 0.98 |
| Bridge pivot | (0.5, 0.43) | (0.5, 0.3) |
| Left/right hinge | (0.025, 0.22) / (0.975, 0.22) | (0.028, 0.333) / (0.970, 0.333) |
| Temple depth / splay | 0.62 / 0.025 | 0.62 / 0.025 |
| Curve / root fraction | 0.065 / 0.18 | 0.055 / 0.20 |
| Vertical target offset | -0.006 | -0.012 |
| Frontal wrap fraction | 0.065 | 0.055 |
| Ear seat offset / weight | -0.012 / 0.90 | -0.020 / 0.95 |

All existing front and transparent temple PNGs are reused unchanged. Golden's measured photographic shaft anchors and lens material calibration are retained. No cutouts, generated artwork or Classic Aviator temples were added.

Controlled real-mesh pixel checks now cover 13 poses per product: frontal, left/right 15/25/30 degrees, roll +/-10 degrees, pitch +/-10 degrees and distance scales 0.75/1.30. The 36 rotated-source/moving-pose checks retain their original hinge assertions. Additional unit checks cover a third generic metadata profile, upper-side landmark recovery through yaw/pitch, lower-contour outliers, legacy positive drop values and Canvas proximal-root preservation. Only Modern Clear and Golden have genuine full-eyewear packages; there is no third real full-eyewear product to validate.

Reference frontal temple-only alpha counts are Modern Clear 427/462 pixels and Golden 439/192 pixels (left/right). All controlled poses retain zero geometric hinge separation and zero lens intrusion. Pixel counts include isolated real temple textures, not a claim of physical-camera realism. Production tests exercise each product's storefront, details, photo, simulated camera, capture, export and hidden diagnostics.

The local catalog sync dry run reports updates only for the two eyewear profiles and leaves the other four products unchanged. Applying the database updates was rejected by automatic approval review and was not performed. The committed package profiles can be applied through the existing sync after approval; live verification therefore uses the current persisted profiles plus the new shared fitting logic.

Final verification: 163 frontend unit tests, 45 production browser tests, 6 read-only live API/browser tests and 45 backend tests pass. The production build and changed-source formatting checks succeed. The focused eyewear browser run also passes all 10 tests. Production/live runs reuse a task-started preview through ignored review configurations to avoid the local Windows managed-server teardown hang.

The legacy `tests/browser/sunglasses-lifecycle.spec.js` fixture still returns an empty Product API object and waits for the removed “Modern Clear Frame” picker button at line 123. Its first test times out on both the unchanged branch archive and the modified code; the remaining legacy fixture cases were not completed. The current production camera tests pass for both products. An initial choker checkout timeout passes on isolated recheck and in the final complete production run.

Physical webcam movements, anatomical ear tracking, hair occlusion and varied-person realism remain unverified. Controlled poses and simulated camera streams do not replace that acceptance review. Catalog before/after snapshots confirm no database product changes during verification.
