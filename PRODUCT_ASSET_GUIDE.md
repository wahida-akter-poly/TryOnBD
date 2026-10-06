# Product asset guide

New products use the existing Product API, PostgreSQL catalog, seller/admin dashboards, cart and checkout. There is no second catalog, startup seeder, public import endpoint, or additional database entity.

## One-time setup

Use only `E:\AOOP\TryOnBD-PRODUCTION`, branch `feature/backend-driven-production-ui`. Java 21, Node/npm and the existing PostgreSQL instance are required. Use the same `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` environment as your backend. Keep credentials in your shell/environment, never in a product manifest or Git.

For the local PostgreSQL instance used in this project:

```powershell
cd E:\AOOP\TryOnBD-PRODUCTION\frontend
$env:DB_URL = 'jdbc:postgresql://127.0.0.1:5433/tryonbd'
# Supply your existing DB_USERNAME and DB_PASSWORD if required by your environment.
$env:PRODUCT_SYNC_SELLER_ID = '2' # Existing Anzara seller; optional when each manifest has sellerId.
```

The importer verifies that the selected seller already exists and has an existing user owner. It never creates seller profiles, users or roles. Use your legitimate seller ID for other stores. Seller dashboard access additionally requires a SELLER account role, assigned by your existing Super Admin workflow.

## Add a product in four steps

1. Create `frontend/public/assets/products/<family>/<product-slug>/`. Families are `eyewear`, `clothing`, `jewelry`. Slugs use lowercase letters/numbers separated by hyphens and must stay stable after import.
2. Place the real transparent PNG assets in that folder.
3. Fill `product.json` with approved business details and optional AR calibration.
4. From `frontend`, run:

```powershell
npm run sync:products
```

Backend-only equivalent: from `backend`, run `.\gradlew.bat syncProducts`. Normal backend startup does not sync or seed products. The tool exits after reporting each package, action and database ID.

Preview business changes with `npm run sync:products -- --dry-run` or `.\gradlew.bat syncProducts -PdryRun`. Dry run creates/updates no product or category rows. As with normal backend startup, Hibernate may apply the additive Product schema upgrade (`asset_key`, `ar_metadata`, `asset_manifest`) on the first connection. Seven entity tables remain in use.

## Small product.json schema

| Field                                 | Meaning                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                                | Required approved product name, nonblank, at most 255 characters.                                                                                                |
| `description`                         | Required seller-supplied string, at most 255 characters; empty text is allowed. No generated marketing claims.                                                   |
| `price`                               | Required JSON number, nonnegative, at most two decimal places and 17 integer digits. Currency follows the existing BDT storefront.                               |
| `stockQuantity`                       | Required nonnegative integer, at most 2,147,483,647. Never inferred from filenames.                                                                              |
| `category`                            | Required existing category name or approved new category name. Lookup ignores case and surrounding whitespace.                                                   |
| `arType`                              | Required: `EYEWEAR` in eyewear, `SHIRT` / `TSHIRT` / `CLOTHING` in clothing, `NECKLACE` in jewelry.                                                              |
| `sellerId`                            | Optional existing seller ID; otherwise `PRODUCT_SYNC_SELLER_ID` is required. Ownership cannot be changed by sync.                                                |
| `frontAsset`                          | Optional local PNG filename; defaults to `front.png`. Becomes the product's public `imageUrl`.                                                                   |
| `leftTempleAsset`, `rightTempleAsset` | Optional local filenames for eyewear; defaults discover `left-temple.png` / `right-temple.png` if present.                                                       |
| `style`                               | Optional necklace style: `CHOKER`, `SHORT`, `PENDANT`. Persisted style takes precedence over legacy name/filename inference.                                     |
| `fitProfile`                          | Optional bounded geometry object; see below. Tracking policy remains shared.                                                                                     |
| `draft`                               | Optional boolean, defaults false. Set true while business metadata awaits approval; assets/type/fit still validate, but no database rows are created.            |
| `existingProductId`                   | Optional explicit adoption of a legacy product. Requires matching existing name, arType and seller, and no conflicting managed key. Do not set for new products. |

Unknown fields, duplicate JSON keys, missing manifests, unknown family/type/style, invalid geometry, negative prices/stock, invalid PNGs and path traversal are errors. The manifest limit is 64KB. A referenced asset must be a local filename, not a URL or another directory. Symlinks and escaped/reparse destinations are refused. Each PNG must be at most 20MB / 24 megapixels and contain both visible content and completely transparent pixels. A fully opaque image or empty cutout is rejected.

Every active package validates before the transactional import begins. Any ownership, category ambiguity or asset-identity conflict rolls back the whole batch. Nothing is partially imported. Drafts report `SKIPPED` and do not invent prices, stock or descriptions.

## Eyewear

Create `assets/products/eyewear/<slug>/` with:

```text
front.png
left-temple.png
right-temple.png
product.json
```

This is a safe draft template. Replace the blank/null business fields with approved values and set `draft` to false before importing:

```json
{
  "draft": true,
  "name": "",
  "description": "",
  "price": null,
  "stockQuantity": null,
  "category": "Eyewear",
  "arType": "EYEWEAR",
  "frontAsset": "front.png",
  "leftTempleAsset": "left-temple.png",
  "rightTempleAsset": "right-temple.png",
  "fitProfile": {
    "bridgePivot": { "x": 0.5, "y": 0.43 },
    "hinges": {
      "left": { "x": 0.025, "y": 0.22 },
      "right": { "x": 0.975, "y": 0.22 }
    }
  }
}
```

Use genuine photographs/cutouts of the same product for all three parts. Front must be straight-on, level, centered, with the bridge and both hinges visible. Rear arms must not be baked into lens interiors. Clear lens openings should be transparent. Temples are isolated side views with a nearly horizontal shaft and the complete ear hook. In viewer coordinates, left-temple's hinge is at its **right** end; right-temple's hinge is at its **left** end. No face/model, background, reflections of rear arms, watermark or generated artwork. Recommended front width 1200-2400px; temple shaft length at least 800px.

`bridgePivot` and `hinges` are normalized coordinates in the front image's visible alpha bounds. The existing loader measures each temple's alpha and hinge/tip; all three surfaces enter the same rigid WebGL assembly, head matrix transform and face-mesh depth occlusion. No per-SKU React component or ID-based fitting is needed.

Allowed eyewear `fitProfile`: normalized `bridgePivot`, ordered `hinges`; `widthMultiplier` 0.5-1.5; `verticalOffset` -0.2-0.4; `rotationOffset` -15..15 degrees; `opacity` 1-100; `templeDepth` 0.4-0.85; `templeSplay` 0.02-0.08; `templeCurve` 0.02-0.12; `templeRootLength` 0.08-0.30; `templeVerticalOffset` -0.08..0.08; `cameraDistance` 4-12. Temple dimensions are fractions of the recovered physical front width; `templeRootLength` is the fraction of posterior depth occupied by the proximal wrap. `templeCurve` controls the outward wrap and posterior taper, while the shared engine estimates the head-side cross-section from the existing face mesh. Both temples use segmented head-local ribbons, genuine photographic textures, and face/head depth occlusion. Lens openings are measured once from enclosed transparent regions in the real front PNG. For calibration, asset orientation and camera acceptance steps, see [EYEWEAR_TRACKING.md](EYEWEAR_TRACKING.md). Start without overrides unless you have measured the real asset.

A front image is required. Missing genuine temples are allowed for catalog import, but virtual try-on is unavailable. Explicitly referenced missing/invalid temple files are errors; omit those fields for a catalog-only package. Classic Aviator uses this safer unavailable behavior; its existing database row remains unchanged. Modern Clear's existing real assembly stays supported through its legacy front-asset mapping. New products resolve their persisted parts, not Modern Clear's parts.

## Clothing / T-shirt

Create `assets/products/clothing/<slug>/` with `front.png` and `product.json`:

```json
{
  "draft": true,
  "name": "",
  "description": "",
  "price": null,
  "stockQuantity": null,
  "category": "Clothing",
  "arType": "TSHIRT",
  "frontAsset": "front.png"
}
```

Use a straight front view, transparent background, complete shoulder seams, neckline, both sleeves and hem. No person/model or mannequin pixels. Keep the garment centered with realistic proportions; recommended width 1600-2400px. All three clothing aliases use the existing pose-aware Shirt engine with this product's `imageUrl`.

Defaults retain the existing measured T-shirt geometry. For a differently shaped/cropped garment, provide product-specific `fitProfile` with `widthMultiplier`, `heightMultiplier` (0.5-1.5), and optional normalized `sourceLandmarks`, `sourceRegions`, `sourceCutouts`, `sourceSleeveAlphaBounds`. Coordinates refer to the **visible alpha bounds**, not the full padded PNG. Use the existing `frontend/src/data/structuredShirtCalibration.js` landmark/region names and measure the actual asset; do not copy coordinates blindly to dissimilar garments. Polygon regions need at least three points. Sleeve bounds require left/right x,y,width,height rectangles within 0..1. The shared pose, silhouette, warping and occlusion policy is preserved.

## Jewelry / Necklace

Create `assets/products/jewelry/<slug>/` with `front.png` and `product.json`. Royal Gold Choker is the approved production example:

```json
{
  "name": "Royal Gold Choker",
  "description": "Elegant gold-tone statement choker necklace with detailed traditional styling, suitable for festive and occasion wear. Supports virtual try-on.",
  "price": 2899,
  "stockQuantity": 12,
  "category": "Jewelry",
  "sellerId": 2,
  "arType": "NECKLACE",
  "style": "CHOKER",
  "frontAsset": "front.png"
}
```

Use the actual complete necklace photographed/cut out straight-on, centered, with matching left/right chain heights. Keep all chains, gems and pendant visible; remove the background, wearer, stand and watermark. Do not include a neck/mannequin. Recommended visible width at least 1000px; PNG canvas typically 1200-2400px. Leave modest transparent padding without cropping the necklace. The aspect ratio must match the real piece.

- `CHOKER`: high neck position, relatively wide, minimal drop.
- `SHORT`: normal neck/upper-chest placement, medium drop.
- `PENDANT`: lower upper-chest placement, more pendant drop.

Optional necklace `fitProfile`: `widthRatio` 0.3-1.2, `dropRatio` -0.2-0.4, `pendantDropRatio` 0-0.8, `heightRatio` 0.1-1.2. Do not supply tracking timings. Shoulder landmarks 11/12 control scale/roll, nose 0 and mouth corners 9/10 contribute the fused neck anchor. The existing 130ms EMA, shoulder fallback, 260ms hold and 450ms fade are unchanged. Silver Diamond Necklace retains its SHORT fallback.

## Repeat runs, edits and inventory

`<family>/<slug>` is a unique nullable key on the existing Product table. A repeat run reports `UNCHANGED` with the same database ID. Never rename/move an imported package to create an update: that would represent a different key. Renaming an existing package must be handled as a deliberate migration, not automatic duplicate adoption.

The importer records the last approved manifest values. If that manifest has not changed, later seller/admin edits and checkout stock deductions survive sync. If you change a manifest, only its changed fields are applied. Changing `stockQuantity` explicitly sets the new absolute inventory; leaving it unchanged does not restock sold units. Shared tracking remains unchanged. A changed front filename updates the same managed product and its asset metadata; assets remain in their package.

Product names, prices or image similarity alone never identify an existing product. Image URL collisions with unrelated rows are refused. Explicit legacy adoption is opt-in and verifies ownership/name/type. Products 1,2,3,4 have no package key and are not touched by ordinary runs. Sync never deletes missing products or assets.

Normal seller/admin product edits continue through the existing Product endpoints/form. AR metadata remains stored when editing business fields, so editing a price does not lose CHOKER or eyewear parts. Changing an image clears stale AR metadata; a new eyewear front without a complete matching manifest is unavailable for try-on. The Product API exposes `arMetadata` with public front/temple URLs, style and fitProfile. `imageUrl` remains authoritative.

Imported products appear through `/api/products` and `/api/products/{id}`. The existing backend-driven storefront groups them under Eyewear, Clothing and Jewelry. Generic cart and checkout use their real ID, server price and current stock, regardless of category. No extra route, component, SQL, catalog array or dashboard integration is needed for each product.

The backend serves PNGs from the same product directory at `/assets/products/<family>/<slug>/<filename>.png`. Both Vite development and preview proxy this path to the backend, so a package added after frontend build works after sync without rebuilding the frontend. This endpoint is read-only, confines paths to the product directory, and does not serve manifests or arbitrary files. Anonymous PNG GET/HEAD requests allow public canvas/CORS access; the existing authenticated API CORS policy is preserved.

For deployment, mount the real package directory into the backend and set `PRODUCT_ASSET_DIRECTORY` (or `product.assets.directory`) for both backend and sync. Your reverse proxy must route `/assets/products/` to the backend alongside `/api/`. The public URL convention stays the same. Sync changes PostgreSQL and serves actual package assets; it does not deploy an application or upload local files to an unrelated remote host.

## Commands and verification

```powershell
# Frontend, from the production worktree's frontend directory
npm run sync:products -- --dry-run
npm run sync:products
npm test
npm run build
npm run test:production
npm run test:live
npm run dev

# Backend, from the production worktree's backend directory
.\gradlew.bat test
.\gradlew.bat bootRun
```

The backend must use the same PostgreSQL environment for live browser tests. Production browser tests use isolated API fixtures and real existing images; backend tests use isolated H2, including imported-product seller/admin edits and checkout. Live checks read the real PostgreSQL catalog and render actual assets without placing test orders.

## Current asset inventory

- New approved package: Royal Gold Choker, Jewelry, Anzara seller 2, price 2899, stock 12, NECKLACE / CHOKER. Its original PNG was moved with SHA-256 verification to `/assets/products/jewelry/royal-gold-choker/front.png` (hash `A96676F2AF1DF3FBE3C2FF3A5D113C30A00DB050CD3A5CD85835DB0ABF469B41`).
- Existing Black T-Shirt, Modern Clear Frame, Classic Aviator and Silver Diamond Necklace already belong to products 1-4. They stay at their existing URLs; no duplicate products or asset copies are imported.
- No additional unowned production clothing images or complete new eyewear sets were found. Existing illustrations/editorial/reference images are not new sellable products.
- The accidental Royal Gold Choker copy under `public/mediapipe` was absent at inspection. No catalog image is added there. Future product assets belong only in `public/assets/products`.

## Completed validation

- PostgreSQL import created Royal Gold Choker as product **5**. Repeated sync reports `UNCHANGED`, ID 5, with exactly one row for its package/image URL.
- Products 1-4 retain every original API business field, and their managed keys/AR metadata remain null. PostgreSQL still has seven entity tables; existing orders (4), carts (0) and try-on sessions (3) were preserved.
- Backend: **39 tests passed**, including atomic rollback, idempotence, stock/seller-edit preservation, category and ownership conflicts, PNG validation/public delivery/CORS, JWT management and imported-product checkout.
- Frontend: **151 unit tests passed**; **32 production browser tests passed**, including cart eligibility, all three management roles, clothing aliases and per-product WebGL assemblies.
- Live PostgreSQL/API/browser: **3 tests passed**, covering Silver Diamond, Royal Gold Choker CHOKER fitting/export, Modern Clear WebGL, Black T-Shirt fitting/export and unavailable Classic Aviator AR.
- `npm run build` passed. Formatting of changed files passed. The broader pre-existing formatting check reports six untouched legacy test/fixture/generator files; they were not rewritten for this feature.
- Anzara's existing owner account was found with CUSTOMER access. Import preserved its ownership and did not change account roles; a SELLER role assignment requires the pending explicit decision or the existing Super Admin workflow. Authorized SELLER/ADMIN/SUPER_ADMIN management was verified in isolated integration/browser tests.
