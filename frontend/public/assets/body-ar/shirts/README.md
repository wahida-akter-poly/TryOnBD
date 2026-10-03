# Working T-shirt asset

Expected path: `frontend/public/assets/body-ar/shirts/tshirt-black-front.png`
(served as `/assets/body-ar/shirts/tshirt-black-front.png`).

Supply a front-view photographic product cutout in RGBA PNG format with real
transparency, visible collar, shoulders, sleeves and full hem. Avoid a baked
background, body/mannequin, perspective photo, cropped hem or illustrated
substitute. A roughly 1000-2000 pixel source is sufficient. The renderer measures
visible alpha bounds once and ignores transparent padding; it preserves the
original PNG. Empty/opaque/missing assets yield `REAL_SHIRT_ASSET_REQUIRED`.

The current file was supplied externally and authorized as a working AR asset.
Its commercial product authenticity remains unconfirmed; final visual acceptance
is pending. No generated or placeholder garment is supplied by this feature.
Working SHA-256:
`0C39AF07EE4E7AC90917B19794D537B7A3415B525B6DF8E8CC8C9FFB482700A8`.

Product-local calibration lives in `src/data/shirtProducts.js`. Set `arType:
'tshirt'` and `shirtAR.asset` on an existing frontend product to opt in. Metadata
includes three neck anchors, shoulder ease, chest/waist/hip ease, hem length,
short-sleeve length/angle and arm-mask calibration.
`sourceRegions` defines independent torso/left-sleeve/right-sleeve polygons;
`sourceLandmarks` identifies collar center/sides, shoulder seams, armpits,
cuff centers/edges, waist and hem in **screen-facing source-image order**, with
coordinates in [0,1] relative to measured visible alpha bounds. Measure these for
each replacement product image; the engine does not assume padded image edges
are anatomical anchors. A new PNG at this path needs no architecture change;
different garment proportions may need calibration changes.

The measured constants are in `src/data/structuredShirtCalibration.js`. Regions
and the collar opening are clipped in memory only; original PNG bytes remain
unchanged. Visible alpha bounds are x91/y56/1091x1127 on the 1278x1230 source.

Read [the architecture and test guide](../../../../SHIRT_AR.md) for URLs,
run commands, screenshots and limitations.
