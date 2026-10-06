# Real necklace catalog and AR flow

Worktree: `E:\AOOP\TryOnBD-PRODUCTION`, branch `feature/backend-driven-production-ui`.
Date: 5 October 2026 (Asia/Dhaka).

## Assets and database

The requested public necklace directory was empty. The one real supplied PNG was at the worktree root. It was moved unchanged to the public directory. No duplicate or generated image was created.

| File | Dimensions | Product ID | Category | Seller | AR type | Image URL |
| --- | --- | --- | --- | --- | --- | --- |
| silver-diamond-necklace.png | 1254 x 1254, transparent RGBA | 4 | Jewelry, ID 4 | Anzara, ID 2 | NECKLACE | /assets/jewelry/necklaces/silver-diamond-necklace.png |

Jewelry was created through `PersistenceService.createCategory` using its database-generated ID. Clothing (1), Eyewear (2), and Accessories (3) were retained. Product 1 Black T-Shirt / SHIRT, product 2 Modern Clear Frame / EYEWEAR, and product 3 Classic Aviator / EYEWEAR retained their original values including price, stock, URLs, seller and category.

Business values requiring review:

- Name: Silver Diamond Necklace, derived only from the filename. This does not verify materials or gemstones.
- Price: 0.00; replace with the actual selling price.
- Stock: 0; replace with verified stock. Cart additions and checkout are stock-blocked until then.
- Description: Product details and pricing pending seller review. Replace with approved details.
- Seller: existing Anzara (2); confirm the intended business owner.

Two existing seller profiles (1 and 2) belong to user 1, whose role remains CUSTOMER. No new seller, user, administrator or privilege assignment was fabricated. An authorized administrator must assign the seller role before that account can use seller management. No administrator currently exists in the local database; the initial bootstrap procedure is in PRODUCTION.md. Seller catalog reads now include every profile owned by the JWT account, fixing the existing multiple-profile visibility problem.

## Repeatable import

The explicit import profile never runs at normal startup and has no public endpoint. It requires database-owner access and an existing seller ID. It validates local PNGs, creates Jewelry only when absent, finds existing products by image URL, retains edited business values and rejects conflicting/duplicate metadata. Imports run transactionally. The second live import returned the same product 4 without inserting another product or category.

Credentials are read from runtime configuration. Keep private values outside repository files.

```powershell
Set-Location E:\AOOP\TryOnBD-PRODUCTION\backend
$env:DB_URL = 'jdbc:postgresql://127.0.0.1:5433/tryonbd'
.\gradlew.bat bootJar
java -jar build/libs/tryonbd-backend-0.0.1-SNAPSHOT.jar --spring.profiles.active=necklace-import --server.port=0 --spring.jpa.hibernate.ddl-auto=validate --necklace.import.seller-id=2
```

The import instance uses a temporary port and closes on completion. Schema validation cannot change tables. Failure rolls back the catalog transaction. Normal product creation remains available through seller/admin APIs. For future necklaces, place a real transparent PNG in the directory and create a product with NECKLACE, the actual Jewelry category ID, its image URL and approved metadata. No new React component is needed.

## Endpoints and roles

| Flow | Endpoints | Authorization |
| --- | --- | --- |
| Catalog/details | GET /api/products, /api/products/{id} | Public |
| Categories | GET /api/categories, /api/categories/{id} | Public |
| Product management | POST /api/products, PUT /api/products/{id}, DELETE /api/products/{id} | SELLER ownership, ADMIN, SUPER_ADMIN |
| Seller catalog/profile | GET /api/account/products, /api/account/seller | JWT identity |
| Category management | POST /api/categories, PUT /api/categories/{id} | ADMIN, SUPER_ADMIN |
| Cart | GET /api/account/cart; POST/PUT /api/account/cart/{id} | JWT identity |
| Checkout | POST /api/account/checkout | JWT identity |
| Orders | GET /api/orders, /api/orders/{id} | Own records; admins can inspect |
| Sessions | GET/POST /api/try-on-sessions | JWT identity; product/type from database |

Product JSON includes id, name, description, price, imageUrl, arType, stockQuantity, categoryId, sellerId, categoryName and sellerName. Existing JPA mappings and seven entities remain. Checkout uses server prices and product locks, reduces stock, stores product/quantity snapshots in Order JSONB and clears Cart atomically. Sessions persist user/product/type/time and capture dimensions/source; private photos remain local.

## Storefront and AR

Jewelry uses backend records and shows an empty state when absent. Cards show real image/name/price/stock, View Details, Try Virtually and authenticated Add to Cart. Numeric details show backend category/seller data and link to `/try-on?productId=4` for this product.

The numeric ID fetches the backend product; normalized arType selects NecklaceOverlay; its imageUrl supplies the overlay. Canvas measures visible pixels once, excludes transparent margins and retains proportions. Source PNG bytes are unchanged. The renderer anchors visible content near the neck above the shoulder midpoint; it retains the original smoothed tracking geometry. Shoulder landmarks 11/12, midpoint, scaling, rotation, smoothing and pose-loss hold/fade remain unchanged. Local assets support canvas capture; remote images require CORS and failures show an explicit error.

There is no preloaded person photo or necklace-preview/overlay-necklace.svg dependency in frontend/src. Legacy diagnostics remain isolated. API fixtures test multiple identities and URLs; only one real necklace PNG was supplied, so live comparison of two different real assets is unavailable.

## Verification and practical limits

The live smoke test uses actual API/DB products without interception. It manually selects an existing test photo, invokes the installed MediaPipe pose model, fits the real PNG and exports a PNG. It creates no live orders or session history. Browser fixtures verify session submission. Transactional H2 tests verify actual persistence, JWT ownership, cart quantity/removal, stock reduction, order snapshots and sessions.

```powershell
Set-Location E:\AOOP\TryOnBD-PRODUCTION\frontend
npm test
npm run build
npm run test:production
npm run test:necklace-live
```

Physical camera hardware was not tested. Camera starts only on user action; browser tests cover permission denial and a simulated camera stream through MediaPipe fitting, capture, download and stream shutdown. Authenticated live checkout and session save remain untested, pending business values and usable credentials. No fake orders or sessions were created in PostgreSQL.

Final validation results (5 October 2026):

- Backend `gradlew.bat test bootJar --no-daemon`: PASS, 18 tests (17 controller/persistence and 1 context); H2 databases only.
- Frontend `npm test`: PASS, 124 tests. Existing necklace geometry tests retained unchanged.
- Frontend `npm run build`: PASS, final renderer included.
- Frontend `npm run test:production`: PASS, 17 Edge browser tests, including actual MediaPipe photo inference and simulated camera capture.
- Frontend `npm run test:necklace-live`: PASS, 1 Edge test with live PostgreSQL product 4/category 4/seller 2, actual MediaPipe photo fitting and PNG export.
- Live import executed twice: the second run returned product 4; only one matching image URL remains.
- PostgreSQL records 1/2/3 and their stock/price/image/category/seller fields remain unchanged.
- PostgreSQL order count stays 4 and session count stays 3 before/after the live smoke checks.
- Changed frontend files pass Prettier checks; `git diff --check` passes.
- Production source search finds no necklace-preview, dummy/sample/demo necklace, overlay-necklace.svg, hardcoded productId=3, or categoryId=7 dependence.

Local ignored artifacts: `frontend/artifacts/real-necklace-live.png`, `frontend/artifacts/real-necklace-capture.png`, `frontend/artifacts/necklace-unit-tests.log`. The real capture was visually reviewed and the initial low chest placement corrected in the renderer without editing tracking geometry.

The implementation is committed on the requested branch. GitHub authentication is absent in this session; the final chat report records the commit hash and push outcome. No prior commit was rewritten, no merge was performed, and the original dirty worktree was not modified.

## Hybrid neck tracking

The necklace engine now fuses pose nose/mouth references with shoulders and supports CHOKER, SHORT and PENDANT calibration derived from product metadata. See [NECKLACE_TRACKING.md](NECKLACE_TRACKING.md) for current tracking, fallback behavior and the next three real asset requirements. The preceding validation results describe the catalog integration checkpoint.
