# Hybrid necklace neck placement

Worktree: `E:\AOOP\TryOnBD-PRODUCTION`.
Branch: `feature/backend-driven-production-ui`.
Date: 5 October 2026 (Asia/Dhaka).

## Tracking model

Use the existing single MediaPipe Pose worker. Pose returns 33 landmarks, including nose 0, mouth corners 9/10, and shoulders 11/12. It has no dedicated neck or chin landmark. Landmark IDs are verified against the [official Pose Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker).

Shoulder midpoint and distance continue to define torso position, necklace scale, roll and mild yaw compression. Measure head positions in a coordinate frame rotated with the shoulder line, using canvas backing pixels; CSS sizing and camera mirroring do not change the fitting model.

Estimate the neck/clavicle anchor as follows:

1. Start with the shoulder-only anchor, 10% of shoulder span above the shoulder midpoint.
2. Validate nose and mouth confidence, finite coordinates, position above the shoulders, lateral bounds, mouth separation and mouth/nose consistency.
3. Interpolate the nose toward the shoulder midpoint (22% of its vertical interval); interpolate the lower-face mouth midpoint toward the shoulders (35% of its interval).
4. Fuse the candidates using confidence-weighted 35% nose / 65% mouth weights. Either valid reference can work alone.
5. Blend this estimate into the shoulder anchor with at most 75% head contribution. Confidence ramps the contribution from zero at 0.55 to the maximum at 0.90. Clamp estimated neck height and keep lateral head influence small, leaving broad positioning with the torso.
6. Apply time-based EMA to neck/placement/pendant points (130 ms), retaining shoulder-point (85 ms), scale (110 ms), roll and yaw (120 ms) smoothing.

These fractions are anatomical fitting heuristics, not a measured neck landmark or a guarantee of perfect fit for every anatomy and image. The browser smoke test exercises the existing Silver Diamond PNG on the manually selected test photo. Real physical-camera and the next three product assets still need visual evaluation when available.

Face Landmarker belongs to the separate eyewear path and does not currently publish a synchronized result for the necklace input. The necklace path therefore does not acquire it, load a second model, or reuse stale face data. Nose and mouth arrive from the existing Pose inference, with no additional MediaPipe processing. Sunglasses, Shirt AR and the shared detectors are unchanged.

## Loss and recovery

Missing/weak/out-of-frame head data retains active shoulder tracking and smoothly converges toward the shoulder-only neck anchor. It can use nose only or mouth only. Invalid shoulders still count as pose loss even if a head is detected. The previous overlay is held for 260 ms, fades over 450 ms, and is hidden after 710 ms. Existing stale-pose reacquisition behavior is retained. Photo fitting is measured once; live camera fitting is smoothed frame by frame.

## Product calibration

Calibration comes from backend product metadata. The first recognized style in the product name wins; otherwise the decoded image filename is inspected. Matching is case-insensitive, accepts hyphens/underscores as separators and ignores URL query parameters. Unknown names default to SHORT, preserving Silver Diamond Necklace. If a single field contains both Choker and Pendant, Choker takes precedence.

| Style token | Width / shoulder span | Placement drop / shoulder span | Intended use |
| --- | --- | --- | --- |
| CHOKER | 0.76 | -0.03 | High near the neck, wider, minimal drop |
| SHORT | 0.72 | +0.04 | Standard necklace near clavicle |
| PENDANT | 0.66 | +0.14 | Lower placement on upper chest |

Pendant guide points use drop ratios 0.08 / 0.23 / 0.42 respectively. The renderer always preserves the actual PNG's visible aspect ratio; it does not stretch a choker image into a pendant. Transparent margins are excluded once at asset load, and geometry supplies the fused anchor and style drop exactly once.

All necklaces continue through numeric product ID -> backend fetch -> NECKLACE arType -> the same NecklaceOverlay. Each product's imageUrl remains the asset. No product/category ID chooses calibration. No new entity, schema field, category, product or image is introduced in this improvement.

## Next three real assets

Supply one real asset for each of CHOKER, SHORT and PENDANT. Requirements:

- PNG with a true alpha channel, transparent background and no visible rectangular backdrop. Transparent outer margins are allowed because the renderer measures visible bounds.
- Front view of the wearable necklace in its natural wearing shape. Upright, with the neck opening/attachment ends toward the top and the pendant or lowest chain point toward the bottom. Avoid tilted or perspective product shots.
- Full necklace visible, with both ends at approximately the same height; center the necklace's wearing axis horizontally. Keep its natural width/height proportions.
- No person/model, text, watermark, packaging, stand or mannequin. Use the actual jewelry cutout rather than a necklace photographed on a body.
- Prefer 1024-2048 pixels on the longest side, with clean alpha edges and adequate visible product detail. This is a quality recommendation; the loader does not impose an exact pixel size or aspect ratio.
- Give each file a unique filename containing the intended style token: `<product>-choker.png`, `<product>-short.png`, `<product>-pendant.png`. These are naming templates only; no files have been generated.
- Place them in `frontend/public/assets/jewelry/necklaces/`. Later create the real backend records with NECKLACE, the actual Jewelry category, approved business values and `/assets/jewelry/necklaces/<filename>.png`. Alternatively put the style token in the product name; name tokens override filename tokens.

Four metadata fixtures exercise Silver Diamond plus the three style variants. Browser fixtures reuse the existing real PNG under distinct query URLs to verify dynamic selection without inventing new assets or database rows. Actual fit of each future design depends on its supplied image and is not claimed before those files exist.

## Verification

Run `npm test`, `npm run build`, `npm run test:production` and, with the existing backend available, `npm run test:necklace-live` from frontend. Tests cover shoulder scale/roll, fused neck placement, either head reference alone, confidence fallback, malformed landmarks, mirroring, EMA and recovery, unchanged hold/fade, all three styles and four backend identities. Browser checks cover product-driven calibration, dynamic image URLs, actual Pose fitting with no Face model load, photo export, session metadata and simulated camera capture/stream cleanup. No backend source changed, so this improvement requires no backend test run or data import.

Final validation (5 October 2026):

- `npm test`: PASS, 136 tests, including 21 focused necklace geometry/asset checks.
- `npm run build`: PASS, final hybrid renderer included.
- `npm run test:production`: PASS, 17 Edge browser tests. Four product styles/URLs, real Pose photo fitting, session submission, simulated camera capture/cleanup and no Face model load verified.
- `npm run test:necklace-live`: PASS, 1 Edge test against the existing live PostgreSQL Silver Diamond product (ID 4), with pose-head fusion, SHORT calibration and PNG download. Capture visually reviewed near the clavicle.
- Changed frontend files pass Prettier; `git diff --check` passes.
- Backend, database schema and shared Pose/Face detector files have no changes. No database write/import command was run in this improvement.
- Public necklace directory still contains only `silver-diamond-necklace.png`, unchanged at 569188 bytes; no new real products or assets were added.

The updated local capture is `frontend/artifacts/real-necklace-capture.png`; browser artifacts remain ignored by Git. Physical camera hardware and the three upcoming real designs are not claimed as tested. Camera lifecycle was tested with a simulated stream and the existing photo fixture.
