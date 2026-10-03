# Structured pose-aware T-shirt AR

This is pose-aware 2.5D fitting, not cloth simulation or garment-size measurement.
The current PNG is authorized for testing; commercial authenticity and final
visual acceptance on the owner's original photo/physical webcam remain pending.

## Run

```powershell
cd E:\AOOP\TryOnBD\frontend
npm run setup:vision
npm run dev
```

- Normal: http://127.0.0.1:5173/try-on?productId=tshirt-preview
- Debug: http://127.0.0.1:5173/try-on?productId=tshirt-preview&arDebug=1

Camera and Upload Photo share the same fitting and renderer. Capture freezes the
visible composite and stops the stream; Download PNG copies it exactly. Debug
meshes/markers are separate DOM elements and never enter exports. The frontend
preview creates no backend product and changes no cart/auth/database behavior.

```powershell
npm run build
npm test
npm run test:browser
```

## Architecture

| Module                          | Responsibility                                                              |
| ------------------------------- | --------------------------------------------------------------------------- |
| `structuredShirtCalibration.js` | Measured source landmarks, three polygons, collar opening and fit constants |
| `shirtProducts.js`              | Product metadata and validation                                             |
| `shirtGeometry.js`              | Coordinate conversion, measurements, yaw, EMA and shoulder fallback         |
| `structuredShirtGeometry.js`    | Neck, torso shape rows, seams and independent sleeves                       |
| `shirtWarp.js`                  | Three clipped textures, separate affine meshes and compositing              |
| `shirtOcclusion.js`             | Pose-guided tapered arm masks                                               |
| `usePoseTracking.js`            | Existing single Pose worker; serial IMAGE/VIDEO inference and lifecycle     |
| `ShirtOverlay.jsx`              | One render loop, snapshots and debug-only DOM                               |
| `ShirtStudio.jsx`               | Existing simple shirt controls                                              |

Component modules live in `src/components/tryon`, calibration in `src/data`, hook
in `src/hooks`. The existing one-person Pose service downsamples inference to
640 pixels. No extra camera, segmentation model or Three.js is introduced.
Render/inference frames use refs rather than per-frame React state. Eyewear
implementation/assets and backend are unchanged by the structured upgrade.

Landmarks: shoulders **11/12**, elbows **13/14**, wrists **15/16**, hips **23/24**.
Connections are verified against installed `PoseLandmarker.POSE_CONNECTIONS` and
the [official enum](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/pose.py).
`poseToCanvas` maps normalized coordinates once to intrinsic canvas pixels and
mirrors camera x once. Anatomical arm pairings stay intact before screen-side
sorting. CSS scale/device pixel ratio never enter fitting.

## Source calibration

Asset: `public/assets/body-ar/shirts/tshirt-black-front.png`, **1278 × 1230**.
Visible alpha >=16/255 bounds: **x91, y56, width1091, height1127**. The original
PNG bytes are unchanged and hash-tested. Repeat the read-only measurement with
`node scripts/inspect-shirt-source.mjs`. Coordinates normalize within these
visible bounds, not padded canvas edges.

| Anchor (source pixels) | Left       | Right      |
| ---------------------- | ---------- | ---------- |
| Shoulder seam          | (269,182)  | (1009,182) |
| Collar side            | (493,128)  | (785,128)  |
| Armpit                 | (341,518)  | (937,518)  |
| Cuff center            | (204,499)  | (1070,499) |
| Cuff outer             | (91,457)   | (1181,457) |
| Cuff inner             | (317,541)  | (959,541)  |
| Waist edge             | (352,780)  | (927,780)  |
| Hem                    | (327,1155) | (949,1155) |

Collar center top: **(639,70)**; center bottom: **(639,174)**;
collar width: **292 px**. The torso polygon follows
shoulder seams, armpits and lower side/hem edges. Each sleeve polygon follows
its seam-to-armpit boundary and curved outer/cuff contour. They share the whole
seam boundary. A **3% shoulder-span** overlap straddles each seam in source space;
the existing sleeve overscan maps it. Opaque source-over fabric avoids doubled
dark seams. Sleeve masks include the actual curved cuff, recovering 14–17 source
pixels previously clipped at the cuff centers. Masks separate regions in memory;
no processed PNG is written.
A calibrated in-memory opening removes the photographed back-neck/tag while
preserving the front collar fabric. Missing/opaque/empty assets report
`REAL_SHIRT_ASSET_REQUIRED`; no fake fallback exists.

## Structured fitting

Neck-base estimate = shoulder midpoint minus **22% shoulder span** along the
down axis. Collar sides span **32% shoulder width** (validated bounds 28–34%).
The collar bottom sits **6% shoulder width below** that estimate, and its top
sits **2.5% above** it. Four local source-to-target anchors retain a curved crew
neck; adjusting them does not translate the whole shirt.
Shoulder seams map to body shoulders with **7.5% outward surface ease** per side
and a **12% upward surface offset** from the internal Pose joint centers. The
previous 2.5%/4.5% calibration left original shoulder clothing outside the virtual
upper silhouette. The distal arm masks did not cause those upper gaps.

Separate shoulder/chest/mid-body/waist/hem rows control torso shape. Hip joints
are inside the pelvis: surface width starts at hip span × **1.35**, bounded to
82–115% of shoulder span. Shoulder-to-hip proportions estimate chest/waist.
Ease per side: **4.5% chest, 5% waist, 4.5% hip**. Hem length starts at **88% of
shoulder-to-hip height**, bounded to 85–150% of natural product seam-to-hem length.
The wider upper bound lets a slender/turned torso reach the upper hip rather
than forcing a chest-length garment from projected shoulder width. Lower rows
smoothly align perpendicular to the shoulder-to-hip centerline. Hem corner height
difference is capped at **6% of shoulder width**; collar/chest keep shoulder roll.
Elbows and wrists never drive torso rows, centerline or hem. Product length adds
**7% of the previous fitted height**, blended into only the lower half. Chest,
logo zone, centerline and hem tilt rules are retained.

Torso mesh: **6 × 6 base cells**, plus collar/shape-row knots. Each sleeve uses
its own **5 × 6 cell mesh** with small contour extensions. Seam vertices sample
the torso mapping itself: the whole boundary remains connected. Elbow motion
never deforms the torso. Each region is texture-clipped before affine rendering.
Small triangle overlaps remove raster seams. Folded, degenerate or >8:1
anisotropic triangles fall back to underlying person pixels rather than stretch
the logo/texture severely; extreme poses may consequently expose gaps.

Cuff centers extend **57% shoulder-to-elbow length**, with subtle turn-dependent
variation bounded to **52–57.3%**. The restored curved source cuff makes measured
visible coverage about **59–60%** in the relaxed frontal fixture; raster tests
check visible alpha against a **50–60%** range at 0°, ±10° and ±20° (one-pixel
tolerance). The center target is not used as a substitute for pixel measurement.
Sleeve angle blends 95% toward upper-arm direction
and allows at most 85 degrees from the roll-adjusted rest angle. Measured sleeve
alpha bounds are left **(91,182,250,360)** and right **(941,182,240,360)**. Their
mean visible width relative to the source shoulder seams, scaled by **0.90**,
sets sleeve body width (about **29.8% of shoulder span**). Cuffs are **90%** of
body width, with a slightly fuller intermediate patch and exact seam attachment.
Missing elbows use the resting direction.

Yaw uses shoulder/hip depth slopes weighted 75/25, preferring plausible world
landmarks over image z; bounded to ±35 degrees. A ±3-degree frontal zone eases
to 12 degrees. Bounded sine perspective affects torso and sleeves separately:
near side wider, far side narrower. Selfie mirroring reverses visible turn sign.

## Arm layering and stability

Order: original frame → torso → independent sleeves → restored foreground arms.
Tapered capsules follow shoulder–elbow–wrist. Distal upper-arm restoration starts
beyond the short cuff and excludes sleeve texture. Forearms may cross torso or
sleeves; actual source pixels are restored. Depth excludes clearly rearward
arms, with a projected front-waist override for hands on hips. This is approximate
pose-guided occlusion: broad existing clothes and noisy depth may expose mask edges.
Mask radius is at most **4.5% of shoulder width**, additionally limited to **16%
of projected limb length**. Elbow/wrist radii taper to **75%/45%** of that radius;
short forearms have their own length bound. Upper-arm restoration begins past
the cuff with **40%** of normal radius, increases to normal radius mid-segment,
then tapers at the elbow. No capsule starts directly at the shoulder.
These conservative masks preserve
central clothing on hands-on-hips poses while allowing actual crossed forearms.
Existing long sleeves remain visible: this is garment layering, not clothing removal.

Debug-only DOM graphics show the four source/destination collar points, source
texture inset, seam boundaries and overlap bands, actual arm-mask capsules,
cuff targets and hem target. They are absent in normal mode and PNG exports.
Read-only audits: `node scripts/inspect-shirt-source.mjs` and
`node scripts/audit-shirt-fit.mjs [local-photo-path]`.

Time-based EMA: landmarks 70 ms, dimensions 95 ms, roll 90 ms, yaw 140 ms,
corners/collar 65 ms. Regions derive from these smoothed measurements. Confidence

> =0.55 is required. Sudden jumps hold; sustained relocation is accepted after
> 350 ms. Weak shoulders hold 250 ms then fade 450 ms. Missing hips first hold,
> then use bounded previous shoulder-based proportions (`SHOULDERS_ONLY`), with
> a compact prompt to include the waist. Full-body reacquisition restores hips.

## Verification and remaining limits

## Pose + body silhouette fusion

Shirts opt into the **person-confidence mask already provided by the local
Pose Landmarker lite task**, `public/mediapipe/pose_landmarker_lite.task`
(5,777,746 bytes). No separate selfie model, cloud service, extra dependency,
worker, camera or inference loop is introduced. The shared service defaults to
masks **off** for eyewear; only `usePoseTracking` opts in. One single-person
Pose task produces both landmarks and the mask from each submitted frame.
See [the official mask option](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js).

The existing scheduler limits joint Pose/mask inference to **15 Hz**; actual
throughput depends on the device. CPU mask values are copied before the
MediaPipe result is closed, reduced to a 256-pixel longest edge, quantized and
transferred. IMAGE mode does this once per upload; VIDEO mode reuses the last
valid boundaries between inference frames. Debug reports actual Pose/mask Hz,
render Hz, inference duration and mask-copy duration (the neural inference is
shared, so there is no separate segmentation-only inference duration).

`shirtSilhouette.js` samples the existing destination torso centerline at
shoulder, upper-chest, chest, middle, waist and hem heights: **0, .12, .24,
.50, .74, 1**. Five parallel scanlines per height reduce pixel noise. All
sampling uses intrinsic canvas coordinates, the original input ROI and exactly
one inverse selfie reflection. The search is bounded to a plausible torso
corridor; head/hair are never used as torso rows.

Shoulder/elbow/wrist corridors exclude hanging arms. Mask boundaries require
real foreground-to-background transitions; a search limit is not an edge.
Arm-censored borders are conservative lower bounds and can be filled from
reliable neighbouring silhouette samples, never body-type presets. Empty,
narrow, over-wide, unstable and low-confidence rows fall back independently.
Person segmentation cannot always separate arms/accessories touching clothing.

Each left/right row is independently smoothed (180 ms EMA) as an offset divided
by Pose shoulder span. Pose translation/distance/roll remain responsive.
Single-frame jumps over .22 shoulder spans hold; consistent changes can be
accepted after 350 ms. Missing masks hold 400 ms, then fade to Pose over 450 ms.
Modes: **SILHOUETTE_FUSED**, **POSE_ONLY**, **SHOULDER_FALLBACK**. Pose itself
retains its previous `FULL_BODY` / `SHOULDERS_ONLY` states and loss handling.

Measured boundaries drive each destination row. Total width ease is **4.5%
chest**, **5% waist**, **4.5% hip**; shoulder edges add 1.5%. The calibrated
collar stays tied to Pose shoulder span, not broad torso width. Independent
sleeves retain their product upper-arm length and gain mask-aware seam roots.
The existing +7% hem length, centerline and vertical clamp remain intact;
wrists never drive hem height. The affine regional renderer is reused, with
10 base horizontal cells when fused and extra logo boundary knots. A monotonic
local remapping caps horizontal logo stretch at 1.12 times the Pose fit, spreading
additional expansion into surrounding fabric rather than blurring the texture.

Only `?arDebug=1` shows mask search corridors/boundaries, outer shoulders, final
mesh rows, widths, mask quality, fallback and throughput. These DOM graphics
remain absent from normal mode and capture/download.

Unit mask fixtures isolate slim/medium/broad silhouettes with the same skeleton;
they are synthetic confidence arrays for geometry tests, **not garment assets
or real-person visual acceptance**. Real browser tests prefer the owner's
`tests/fixtures/shirt-slim-reference.png` and `shirt-broad-reference.png` when
present; otherwise they disclose their existing real project portraits.
`shirt-silhouette-{slim,medium,broad,left-turn,right-turn}.png` and corresponding
JSON pixel/width reports are saved under `artifacts/`. VIDEO throughput is saved
to `artifacts/shirt-silhouette-performance.json` using a real portrait through
`canvas.captureStream`, not a physical webcam. Final slim/heavier acceptance
remains pending the two supplied reference files and physical camera review.

## Regression checks

Unit tests cover calibration/PNG bytes, neck anchors, full seam attachment,
independent sleeves, upper-arm length, body perspective, mask geometry and
fallback/smoothing. Existing eyewear tests remain. Browser checks sample actual
torso/cuff garment pixels and restored source pixels, exact exports, normal-mode
debug absence, camera lifecycle and existing regressions.

Structured portrait tests use real Pose IMAGE inference on real project photos
and an attributed hands-on-hips photograph. Right-turn uses that photograph
through `canvas.captureStream` and real VIDEO inference with selfie mirroring;
it is a simulated camera test, not a physical webcam. A mirrored raised-arm photo
checks the opposite arm. No new garment asset is generated.

Reviewed artifacts:

- `artifacts/shirt-final-frontal.png` (normal mode, actual Pose IMAGE)
- `artifacts/shirt-final-arm-down.png` (same relaxed frontal reference)
- `artifacts/shirt-final-left-turn.png`
- `artifacts/shirt-final-right-turn.png`
- `artifacts/shirt-polished-frontal.png`
- `artifacts/shirt-polished-hands-on-hips.png`
- `artifacts/shirt-polished-left-turn.png`
- `artifacts/shirt-polished-right-turn.png`
- `artifacts/shirt-structured-frontal.png`
- `artifacts/shirt-structured-hands-on-hips.png`
- `artifacts/shirt-structured-left-turn.png`
- `artifacts/shirt-structured-right-turn.png`
- `artifacts/shirt-structured-arm-raised.png`
- `artifacts/shirt-structured-right-arm-raised.png`

Older `shirt-ar-*` images remain controlled tracking/raster fixtures, not
real-person acceptance. Structured screenshots show separate fitting and arm
layering but do not establish final commercial quality. A front photograph
cannot reconstruct lighting, new folds, side/back fabric, exact neck depth or
fully remove existing clothing. Review the original failing photo and physical
webcam before acceptance. Future improvements can add approved per-product
calibration, segmentation masks and real side textures before full 3D rendering.
