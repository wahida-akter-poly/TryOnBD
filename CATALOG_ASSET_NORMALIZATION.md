# Catalog asset normalization

Worktree: `E:\AOOP\TryOnBD-PRODUCTION`. Branch: `feature/catalog-product-assets`, based on the completed eyewear fix `68d12fa`. No AR geometry, tracking, smoothing, auth, order or database schema changes were needed.

## Cause and migration

The database still pointed to legacy files after the user moved the Shirt and Modern Clear directories under `assets/products/`. Classic Aviator's original file had been deleted from the worktree. `ProductImage` treated load failure and a genuinely empty URL as the same "No product image uploaded" state. These were actual path/file failures, not URL serialization or Vite configuration errors.

The existing worktree sources were `assets/products/clothing/shirts/tshirt-black-front.png` and `assets/products/eyewear/modern clear frame/modern-clear-*.png` / `.webp`, moved by the user without URL/manifest updates. The moved Shirt/Modern files were checked against HEAD using SHA-256. Aviator's real front was recovered from HEAD directly into its standardized package. No image was resized, recompressed, regenerated or replaced. Four explicit `existingProductId` manifests adopt the existing rows. Existing business fields and creation timestamps were compared before/after by product ID. Royal Gold Choker is wholly unchanged. There are still five products; no replacement IDs or new category/seller rows were created.

| ID  | Product                 | Old public image URL                                      | Final public image URL                                       |
| --- | ----------------------- | --------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | Black T-Shirt           | `/assets/body-ar/shirts/tshirt-black-front.png`           | `/assets/products/clothing/black-t-shirt/front.png`          |
| 2   | Modern Clear Frame      | `/assets/face-ar/sunglasses/modern-clear-front-clean.png` | `/assets/products/eyewear/modern-clear-frame/front.png`      |
| 3   | Classic Aviator         | `/assets/face-ar/sunglasses/aviator-real.png`             | `/assets/products/eyewear/classic-aviator/front.png`         |
| 4   | Silver Diamond Necklace | `/assets/jewelry/necklaces/silver-diamond-necklace.png`   | `/assets/products/jewelry/silver-diamond-necklace/front.png` |
| 5   | Royal Gold Choker       | `/assets/products/jewelry/royal-gold-choker/front.png`    | unchanged                                                    |

All package folders contain `product.json` using the existing schema: name, description, price, stockQuantity, category, sellerId, arType, frontAsset and optional existingProductId/style/fitProfile/temple assets. Prices and stock come from existing PostgreSQL records, never image filenames. Seller 1 owns products 1-3, Anzara (seller 2) owns 4-5; category IDs remain 1/2/4. Product 4 retains price 0 and stock 0 pending seller review; it was not made artificially purchasable.

## Modern Clear and shared AR

The exact normalized left/right PNGs are now `/assets/products/eyewear/modern-clear-frame/left-temple.png` and `/assets/products/eyewear/modern-clear-frame/right-temple.png`. The previous raw/source images are retained in that package for opt-in provenance tools. They are not new products.

The persisted fit profile retains width .92; bridge (.5,.43); hinges (.025,.22)/(.975,.22); vertical offset .03; rotation 0; opacity 100; temple depth .62; splay .025; curve .065; root fraction .18; vertical drop .012. Product metadata resolves all three textures. Rigid head-local geometry, 16-strip temples, face/head depth, lens apertures, alpha blending and root smoothing are unchanged.

Classic Aviator has a real front and remains browsable and purchasable (existing stock 22). It has no genuine separate temple pair, so full AR remains unavailable. No Modern Clear temples were attached to it.

Shirt uses its own backend front in the existing pose/segmentation engine. Silver retains NECKLACE/SHORT; Royal retains NECKLACE/CHOKER. Neither engine was rewritten.

## Pending incoming product

The only new product photo set found was `assets/products/eyewear/golden frame/`: `chappie_front_1.webp`, `chappie_angle_1.webp`, `chappie_side_1.webp`. There was no Black Oversized T-Shirt, Black Square package, or other new approved package.

These three untouched originals were preserved at `frontend/public/assets/incoming-products/eyewear/golden-frame/`, outside strict sync discovery. They remain untracked user assets and are excluded from this commit. No business product or generated PNG was created.

Needed before ingestion: approved name, description, selling price, stockQuantity, category, sellerId and arType; a genuine transparent front PNG; separate genuine left/right temple PNGs for full AR, with measured optional fit calibration. Existing front WebP shows photographed rear arms through lenses and a white background, so renaming it to PNG would not make a valid AR package. Do not infer materials or claims from photos.

## Verification

From `frontend`, use `npm run sync:products` (or `-- --dry-run`) with the existing PostgreSQL environment. The reviewed first run reported UPDATED for IDs 1-4 and UNCHANGED for 5; the second run reported all five UNCHANGED. No SQL mutation was used.

Frontend unit tests: 157 passed. Backend: 42 passed, including a new five-row adoption/repeat-sync/checkout-stock regression. Final production browser suite: 37 passed, including both existing seller scopes, Admin/Super Admin, checkout image loading, eight eyewear poses and the preserved body AR flows. Live API/browser suite: 4 passed against the actual PostgreSQL-backed API. Production build passed (Vite, 1698 modules). Changed-file Prettier and Git whitespace checks passed. All five package images and Modern Clear parts returned actual PNGs from frontend and backend HTTP endpoints; decoded image dimensions were nonzero. Desktop/mobile Shop, product details, management/cart and eyewear captures were visually inspected.

The live browser checks GET each product and its actual PNG from both frontend preview and backend asset serving, check PNG signatures/content type, decode nonzero natural dimensions, and inspect Shop at 1280px/390px plus all five details pages. Cart/checkout and both existing sellers/Admin/Super Admin image previews are exercised with isolated account API fixtures while serving real PNGs. Authenticated live management writes and live purchases are not performed. Existing backend ownership/stock/order tests remain in the passing suite.

Ignored artifacts include `frontend/artifacts/catalog-normalized-1280.png`, `catalog-normalized-390.png`, `product-normalized-1.png` through `product-normalized-5.png`, `catalog-checkout.png`, and `catalog-management-*.png`. Existing eight-pose eyewear captures and live Shirt/Necklace/Modern Clear captures are regenerated and visually inspected. These fixtures do not substitute for physical camera testing.

## Retained legacy files and user changes

The Silver legacy PNG is intentionally retained because the historical opt-in `necklace-import` tool still references its old directory. Future additions use only `sync:products`; the old filename-based importer is not the standardized ingestion workflow. Other decorative/editorial/manual diagnostic assets are not backend catalog fallbacks.

Pre-existing deletions of unrelated `assets/face-ar` illustrative PNG/SVG prototypes were left unstaged and untouched. They are not included in this normalization commit. Production product assets that were moved have verified standardized replacements and migrated code/test references. MediaPipe contains runtime/task/WASM files only; no catalog image duplicate was found there.
