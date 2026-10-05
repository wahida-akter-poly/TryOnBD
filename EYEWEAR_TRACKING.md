# Eyewear fitting and production verification

Worktree: `E:\AOOP\TryOnBD-PRODUCTION`, branch `feature/backend-driven-production-ui`.

## Pipeline

The front and available real temple photographs are one rigid object in head-local 3D coordinates. WebGL renders their textured surfaces with perspective-correct interpolation and a depth buffer. This is **3D projection of photographed planes**, not a volumetric CAD/GLTF model. There is no Three.js dependency or duplicate face detector.

1. The existing shared Face Landmarker returns landmarks and its column-major 4x4 canonical-to-detected-face matrix. Validate the affine matrix, uniform scale, orthogonal axes and handedness; extract yaw, pitch and roll. Convert the y-up/z-toward convention to the screen/camera convention. Mirror yaw and roll once for selfie video.
2. Nose-root landmarks 6/168 retain the bridge anchor. Eye corners 33/133/362/263 provide a fallback eye-line roll; face sides 234/454 determine scale. Recover object width from the already foreshortened face span before projecting. Product fit and user size/height controls remain independent.
3. Fixed front-plane hinge coordinates and two fixed posterior temple paths share one rotation and pinhole projection. A small fixed hinge bend makes the stems tuck behind the frame frontally. No yaw-dependent opening angle, independent arm-length filter or per-arm swinging remains.
4. The existing 468 face-surface landmarks and MediaPipe's 852 tessellation triangles form a depth-only occluder. Compare rear-plane depth against the observed face instead of erasing everything inside its outline. Both temples have a strict hinge/lens pixel guard and render before the front. Transparent clear lenses cannot reveal rear-arm ghosts.
5. Perspective-correct textures use the existing alpha-measured hinge pivots, preserving photographed shafts and hooks. Premultiplied alpha avoids dark halos. The same composite canvas supplies preview, immutable camera capture and PNG download.

Matrix yaw/pitch use a 90 ms EMA; roll/size retain the existing 40 ms filters and the bridge its responsive 8-18 ms filter. All axes share the 180 ms spike/invalid-pose hold and bounded recovery. Sustained turns do not repeatedly restart the hold. Lost faces retain the existing 150 ms grace and 120 ms fade. Landmark orientation is the matrix fallback. WebGL/context failures use the same projected rig through Canvas, with conservative far-side head masking and the same lens guard. GPU textures, buffers and shaders are released on unmount; unused textures are pruned on asset changes. Preview retains its existing 1280-pixel maximum dimension.

The matrix output is documented in the [official Face Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker). Matrix conventions follow the [official matrix format](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/framework/formats/matrix_data.proto). Depth uses relative Face Landmarker z measurements; it is an approximation rather than measured physical millimetres.

## Real product assets and backend integration

`eyewearAssetManifests` in `frontend/src/data/faceAccessories.js` maps real front-image paths to optional real left/right parts, hinge/bridge pivots, depth, splay and lens calibration. The selected backend `imageUrl` always supplies the front. Local cache query strings retain calibration; database IDs never select geometry. Unknown images use their own front, without substitute temple photographs.

Modern Clear reuses its three existing, unmodified PNGs. Classic Aviator reuses its existing front PNG. Its original photo contains rear arms visible through both lenses; a calibrated, once-per-load lens material removes those baked shapes from the AR texture. Apertures follow the real inner rims; median colour samples come from unobstructed pixels of that same photo. Original rims/hinges and nose-pad hardware remain. Lens opacity is an AR calibration, not a measured optical specification. The original PNG and catalog thumbnail are unchanged. No fake product image, generated temple, product row or image URL was added.

For another eyewear product, supply a real transparent frontal PNG, preferably with lens apertures free of background/rear-arm photographs. Optional real left/right side-view temple PNGs must include their hinge ends and ear hooks, with intact alpha and no canvas clipping. Register matching bridge/hinge coordinates and part paths in the manifest. A front-only asset is supported; fully turning stems require that product's actual parts. No component per product or database entity is needed. Existing seller/admin product create/update continues to accept `imageUrl` and controlled `arType` through the API.

`arType` still drives EYEWEAR/SUNGLASSES, SHIRT/TSHIRT/CLOTHING, and NECKLACE/JEWELRY routing. Shirt/necklace implementation files, PostgreSQL entities, JWT rules, account flows and backend product values were preserved. Diagnostics require `?arDebug=1` on an eyewear product and use the normal production studio. No debug controls bypass the lens guards or force arms open.

## Acceptance and evidence

Commands:

```powershell
Set-Location E:\AOOP\TryOnBD-PRODUCTION\backend
.\gradlew.bat test --no-daemon
Set-Location E:\AOOP\TryOnBD-PRODUCTION\frontend
npm test
npm run build
npm run test:production
npm run test:live
```

- Backend: 18 passing isolated H2 tests; existing test task was up to date. JWT/role/ownership/persistence regression checks remain intact. No backend implementation changes.
- Frontend: 143 passing unit tests, including rigid hinges, frontal projection, near/far direction, pitch/yaw/roll, mirroring, scale/fit controls, pose spikes/recovery, EMA, fallback, real lens sampling, multiple products, original asset hashes, shirt and necklace regressions.
- Production browser: 23 tests covering API routing, auth/role/cart/seller flows, necklace photo/camera, WebGL face depth, lens ghosts, production eyewear photo/export/debug gating, Canvas fallback and simulated mirrored camera capture/stream release.
- Live browser: 2 read-only tests against PostgreSQL-backed API data. GET products 1/2/3/4 by ID and fetch each actual image. Catalog/details/Try Virtually/photo/download succeed for both real eyewear products, the real shirt and Silver Diamond Necklace. Protected endpoints return 401 to guests. No live data was written.
- Build: Vite production build succeeds. `git diff --check` passes.

Pixel acceptance uses real existing PNGs and real detected face landmarks, with controlled matrices at 0, -15, +15, -30 and +30 degrees. Results: zero hinge error, zero temple pixels inside lenses, about 1.5% frontal wing extent, visible near shafts, reduced/hidden far shafts, and an actual face-depth reduction relative to rendering without the mesh. These are controlled renderer fixtures on a portrait, **not photographs of physical head turns**. Simulated camera tests exercise video mode, selfie mirroring, capture and teardown; a physical webcam and a varied-person turning video remain untested.

Ignored local artifacts in `frontend/artifacts/` include:

- `eyewear-rigid-frontal.png`, `eyewear-rigid-left.png`, `eyewear-rigid-right.png`: controlled yaw projection.
- `eyewear-production-frontal.png`, `eyewear-production-capture.png`: production photo and PNG export.
- `live-ar-product-1-capture.png`, `live-ar-product-2-capture.png`, `live-ar-product-3-capture.png`: real shirt, Modern Clear and Aviator, visually inspected.
- `real-necklace-capture.png`: live Silver Diamond Necklace, visually inspected.

The older `tests/browser` suites describe earlier preview/wing implementations and are not the production acceptance command. Their obsolete outward-wing requirements were replaced by the production suite above; meaningful landmark/asset/ear and body-engine unit regression coverage remains.

## Limits and local startup

Photographed planes have no volumetric frame thickness or manufacturer CAD, and Face Landmarker does not supply anatomical ear surfaces/hair segmentation. Moderate yaw is covered; very large yaw/pitch is bounded to 65/40 degrees. Unknown assets may need their own fit/aperture calibration. Full product-specific Aviator side fitting needs genuine Aviator temple assets. Physical camera quality varies with lighting and landmark confidence.

Backend, terminal 1 (use your existing database credentials):

```powershell
Set-Location E:\AOOP\TryOnBD-PRODUCTION\backend
$env:DB_URL = 'jdbc:postgresql://127.0.0.1:5433/tryonbd'
$env:DB_USERNAME = '<your PostgreSQL user>'
$env:DB_PASSWORD = '<your PostgreSQL password>'
.\gradlew.bat bootRun
```

Frontend, terminal 2:

```powershell
Set-Location E:\AOOP\TryOnBD-PRODUCTION\frontend
npm ci
npm run setup:vision
npm run dev
```

Open `http://127.0.0.1:5173`; backend is `http://localhost:8080`. Keep the existing PostgreSQL service running. The two user-supplied, already-untracked `royal-gold-choker.png` copies are preserved and excluded from this eyewear change; no new necklace product was imported.

## Changed files

- `frontend/src/components/tryon/eyewearRig.js`: fixed 3D assembly and Canvas projection fallback.
- `frontend/src/components/tryon/eyewearWebGL.js`: textured-plane/depth renderer and GPU cleanup.
- `frontend/src/components/tryon/lensSurface.js`: real-photo-derived lens material.
- `frontend/src/components/tryon/headPose.js`: all-axis matrix orientation and guarding.
- `frontend/src/components/tryon/faceGeometry.js`: shared rig, degree/pitch smoothing, bridge/face surface and diagnostics.
- `frontend/src/components/tryon/templeGeometry.js`: removed superseded wing projection, retained face contour/texture/ear helpers.
- `frontend/src/components/tryon/CanvasPreview.jsx`: rig integration, lens loading, consistent occluder coordinates, GPU disposal, production diagnostics.
- `frontend/src/data/faceAccessories.js`: real-asset manifest and calibrated Aviator lens apertures.
- `frontend/src/pages/public/TryOn.jsx`: explicit eyewear debug flag within production UX.
- `frontend/tests/eyewearRig.test.js`: rigid assembly and lens acceptance.
- `frontend/tests/faceGeometry.test.js`: preserve existing landmark/matrix/asset regression checks; replace obsolete wing expectations.
- `frontend/tests/shirtGeometry.test.js`: retain body and product-pixel guards; remove the obsolete ban on editing eyewear code.
- `frontend/tests/production/eyewear.spec.js`: real-pixel/photo/camera/WebGL/fallback/ghost browser checks.
- `frontend/tests/live/production-ar.spec.js`: read-only product API and actual shirt/eyewear flows.
- `frontend/package.json`: include rig tests and generic live-test alias.
- `frontend/public/assets/face-ar/sunglasses/README.md`, `PRODUCTION.md`, this file: current asset/pipeline/run/verification documentation.
