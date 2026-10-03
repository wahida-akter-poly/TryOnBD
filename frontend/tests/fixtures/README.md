`ear-front.jpg`: public-domain official portrait, sourced from
https://commons.wikimedia.org/wiki/File:President_Barack_Obama.jpg
Original: https://upload.wikimedia.org/wikipedia/commons/8/8d/President_Barack_Obama.jpg

Used only by browser tests; never loaded by the production UI. The three ear
screenshots use this frontal portrait with controlled 0/-30/+30 degree matrix
inputs. The earlier `modern-clear-ear-anchor-*` artifacts document the ear-driven
version. Current `modern-clear-restored-temples-*` artifacts verify the restored
stable real-PNG projection and that Pose endpoints cannot shorten it. These are
controlled yaw fixtures, not photographs of physical head turns.

`modern-clear-foreshortened-{frontal,left-10,left-20,right-10,right-20}.png`
uses the same real portrait and actual Face Landmarker landmarks with controlled
matrix yaw at 0/-10/-20/+10/+20 degrees. These screenshots verify short frontal
screen projection, progressive near/far lengths and fixed alpha hinge pivots;
the PNG assets and front-frame fitting are unchanged.

`modern-clear-tuned-{frontal,left-10,left-15,left-20,right-10,right-15,right-20}.png`
documents the final projection micro-tuning on that same portrait: 15% frontal
length and smooth growth over 3–24° yaw. Like the earlier artifacts, these use
controlled matrix yaw, not photographs of physical head turns.

Shirt browser fixtures in `tests/browser/shirt-ar.spec.js` supply normalized
shoulder/hip/elbow points and world depth through the existing Pose worker
boundary. They use a neutral square video source and the externally supplied
working PNG, whose commercial product authenticity remains unconfirmed.
`shirt-ar-{frontal,left-turn,right-turn,shoulder-tilt}.png` artifacts show actual
warped garment pixels and their torso anchors. These are controlled fixtures,
not real webcam or full-body-photo acceptance. The `shirt-ar-tracking-*` images
deliberately block the PNG to exercise `REAL_SHIRT_ASSET_REQUIRED`.

The mesh raster coverage test also uses a small in-memory colour rectangle as a
numerical sampling probe. It is never loaded as a shirt product, persisted as an
asset or shown in screenshots. Current working-PNG tests independently check
actual torso coverage, alpha crop and exact capture/download bytes. A separate
real Pose worker IMAGE test checks full normalized and world landmark output.

Structured shirt tests additionally use real person images already bundled at
`public/assets/shirt.jpg`, `panjabi.jpg` and `editorial.jpg` (credits in the
frontend README). They run actual Pose IMAGE inference. The right-arm fixture
mirrors the editorial image in memory; it does not generate a garment.

`shirt-hands-on-hips.jpg`: public-domain U.S. Army photograph of Combatives
heavyweight champion Brandon Sayles, 596x722. Source and license:
https://commons.wikimedia.org/wiki/File:U.S._Army_Combatives_heavyweight_champion_Brandon_Sayles.jpg
Original:
https://upload.wikimedia.org/wikipedia/commons/f/f7/U.S._Army_Combatives_heavyweight_champion_Brandon_Sayles.jpg
The source page identifies it as a U.S. Army federal-government work in the
public domain in the United States. It is a test-only person photograph, never
a garment asset or production product image. Its mirrored VIDEO variant uses
canvas.captureStream and the existing camera lifecycle, not a physical webcam.

`shirt-structured-*` artifacts contain actual photographic people and the current
working garment PNG. Tests check collar/seams, sleeve pixel coverage, torso
coverage and original foreground-arm pixels, rather than opacity alone. The
working PNG's authenticity and final commercial visual acceptance remain pending.
