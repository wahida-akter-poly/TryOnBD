# Real eyewear assets

The current production engine and verification are documented in [EYEWEAR_TRACKING.md](../../../../../EYEWEAR_TRACKING.md).

Production uses backend product `imageUrl`. Existing real assets are:

- `modern-clear-front-clean.png`: real front with transparent lens apertures.
- `modern-clear-left-temple-normalized.png` and `modern-clear-right-temple-normalized.png`: actual shaft/hook pixels, with alpha/PCA hinge calibration.
- `aviator-real.png`: real Aviator front photograph. AR derives a calibrated lens material from this image to remove photographed rear arms in the apertures; the source/catalog PNG is unchanged.

`eyewearAssetManifests` associates actual front URLs with optional actual parts and fit metadata. Parts load atomically. Missing required parts produce an error and disable capture; unknown product fronts never receive another product's arms. Existing numeric database IDs do not choose assets or fit.

The front and both stems share one fixed 3D assembly. Matrix yaw/pitch/roll and perspective drive every vertex. WebGL depth-tests stems against the existing detected face mesh and guards both lens interiors. Canvas provides a fallback with the same geometry. Capture/export copy the already-rendered composite. The previous 15%-to-57.5% outward-wing projection and independent arm filters have been removed.

Source product photos and normalized PNGs remain unmodified. Historical extraction/PCA measurements live in `modernClearTempleCalibration.js`; the existing processing scripts are tools for those source photographs, not catalog import/seed commands. Older illustrated assets and historical preview diagnostics are not product fallbacks in the backend-driven production studio.

For another real product, supply transparent front and optional left/right side photographs, complete hinge/ear-hook ends, no person/background/text, and consistent orientation. Register measured pivots/part paths and any lens-aperture calibration. No generated parts or product records are added automatically.

Normal: `/try-on?productId=<backend ID>`.
Diagnostics: `/try-on?productId=<backend ID>&arDebug=1` (eyewear only).
