# TryOnBD frontend

A JavaScript React demonstration of a Bangladeshi fashion storefront, browser face-tracked virtual try-on studio, four existing dashboard experiences, and the Spring Boot controller milestone.

All project changes are confined to `frontend/`. The backend was inspected read-only to verify endpoint contracts. No backend code, Gradle configuration, tests, database configuration, ERD, or root files were changed.

## Run

```powershell
cd E:\AOOP\TryOnBD\frontend
npm install
npm run setup:vision
npm run dev
```

Open **http://127.0.0.1:5173**. The existing Spring Boot application is expected at **http://localhost:8080**. It is optional for browsing the seed collection, using local cart/wishlist, and working with the canvas. Mutation forms require a successful controller response, unless the user explicitly selects **Local Demo Fallback** while the backend is offline.

```powershell
npm run build
npm run preview
npm test
npm run test:browser
```

Browser tests use installed Microsoft Edge in headless mode. To use a different browser, adjust `channel` in `playwright.config.js`; no backend is started by the tests. `scripts/capture.mjs` captures desktop/mobile presentation screenshots while the dev server is running.

## Stack

Runtime: React 18, React DOM, React Router 7, Axios, Lucide React, Recharts 3. Build and styling: Vite 6, the React Vite plugin, Tailwind CSS 3, PostCSS, Autoprefixer. Development verification: Playwright, native Node test runner, Prettier.

Vite 6 was selected for the installed Node 20.15 runtime. Tailwind utility classes and an explicit shared stylesheet form the design system. The project does not contain authored `.ts` or `.tsx` files. Third-party packages may ship TypeScript declaration files inside `node_modules`.

## Layout

```text
frontend/
  public/assets/         Local editorial photos, demo illustrations, canvas overlay SVGs
  src/
    components/
      common/            Form controls, dialogs, tables, feedback, connection indicator
      dashboard/         Overviews, analytics, CRUD, profiles, local administration
      layout/            Navbar, footer, role switcher, cart drawer
      product/           Product cards/images and review form
      tryon/             Canvas renderer and overlay configuration
    context/             AppContext, demo state, API mutation synchronization
    data/mock/           Fictional users, sellers, products, reviews, orders, sessions
    data/dashboardConfig.js
    hooks/               Async form state
    layouts/             Responsive dashboard shell and navigation
    pages/               Storefront, authentication, studio, dashboards, playground
    services/            Axios client, exact DTO contracts, seven dedicated services
    utils/               Formatting, category hierarchy, safe localStorage
    App.jsx              Route composition, lazy loading, error boundary
    main.jsx
    styles.css
  tests/                 DTO/storage tests and browser workflows
  scripts/capture.mjs
  vite.config.js
```

## Pages and routes

| Routes                                    | Experience                                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                       | Editorial hero, collections, trending/new products, studio preview, how it works, fictional testimonials, seller CTA, local newsletter interest    |
| `/products`, `/search`                    | Search, hierarchy/subcategory filters, price/rating/try-on filters, sorting, pagination, mobile filter drawer                                      |
| `/products/:id`                           | Image crop gallery, product/seller information, stock, local cart/wishlist, demo buy, reviews, related pieces                                      |
| `/categories`                             | Expandable visual hierarchy and collection tiles                                                                                                   |
| `/try-on`                                 | Face-tracked sunglasses and head jewelry; camera/upload, adjustments, capture, download, local history                                             |
| `/about`                                  | How it works and real/demo/future feature classification                                                                                           |
| `/login`, `/register`, `/seller-register` | Mock role login and controller-backed user/seller request forms                                                                                    |
| `/forgot-password`, `/reset-password`     | Explicitly labeled recovery previews; no emails or password changes                                                                                |
| `/checkout`, `/invoice/:id`               | Promo `STYLE10`, local customer/item details, controller order validation, printable local invoice                                                 |
| `/api-playground`                         | All 35 existing HTTP routes, body editor, examples, response status/body/timing                                                                    |
| `/dashboard/customer[/:section]`          | Overview, profile, orders/details, reviews/write-review, try-on history, wishlist, account settings                                                |
| `/dashboard/seller[/:section]`            | Overview, business profile, products/add/edit, fulfillment, reviews, performance, demo plans, settings                                             |
| `/dashboard/admin[/:section]`             | Users, sellers/local moderation, products, category tree/CRUD, orders, reviews, sessions, reports, settings                                        |
| `/dashboard/super-admin[/:section]`       | System overview, all management/monitoring views, local admin management, analytics, permission planning matrix, platform settings, local activity |
| Other paths                               | Helpful 404 screen                                                                                                                                 |

The complete dashboard section slugs are centralized in `src/data/dashboardConfig.js`. Role switching is always labeled **Demo Role**. It is not authentication or authorization. Demo login accepts a valid-format email and any password of at least eight characters; those credentials are not verified or stored. Remember-me stores only the selected demo identity and role.

## Reusable components

`Button`, `IconButton`, `Input`, `PasswordInput`, `Textarea`, `Select`, `SearchInput`, `Modal`, `ConfirmDialog`, `Drawer`, `Tabs`, `Badge`, `StatusChip`, `ProductCard`, `ProductImage`, `StatCard`, `ChartCard`, searchable/sortable/paginated `Table`, `Pagination`, `Breadcrumbs`, `Navbar`, dashboard sidebar, `Footer`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `LoadingState`, `Avatar`, `Dropdown`, `Price`, and interactive `Rating`.

Native dialogs provide focus containment, Escape support, accessible titles, backdrop dismissal, and scroll locking. Forms have associated labels, required/range/email validation, inline errors, and busy states. Layouts support mobile navigation, dashboard drawers, responsive table scrolling, visible focus, reduced motion, and print invoices.

## API boundary

`src/services/api.js` owns Axios, timeout, network classification, and connection events. Each dedicated service delegates to `createService.js`, which selects only supported fields using `contracts.js`:

- `userService.js`
- `sellerService.js`
- `productService.js`
- `categoryService.js`
- `tryOnService.js`
- `reviewService.js`
- `orderService.js`

Every resource has exactly these five routes: `GET /api/{resource}`, `GET /api/{resource}/{id}`, `POST /api/{resource}`, `PUT` as listed below, and `DELETE /api/{resource}/{id}`. Seven resources × five routes = **35**.

| Resource        | PUT path                           |
| --------------- | ---------------------------------- |
| users           | `/api/users/{id}`                  |
| sellers         | `/api/sellers/{id}`                |
| products        | `/api/products/{id}`               |
| categories      | `/api/categories/{id}`             |
| try-on-sessions | `/api/try-on-sessions/{id}/result` |
| reviews         | `/api/reviews/{id}`                |
| orders          | `/api/orders/{id}/status`          |

No cart, wishlist, payment, shipping, role, admin, analytics, revenue, subscription, or health endpoint was invented. The Playground intentionally sends the JSON exactly as edited so invalid DTO validation can be demonstrated. Normal application forms whitelist DTO fields.

Critical contract rules: user updates omit password; product requests omit local try-on configuration; try-on creation uses `tryOnType` and omits `resultImageUrl`; result updates send only `resultImageUrl`; order creation sends only `userId`, `totalAmount`, `orderStatus`; status updates send only `orderStatus`; category parents may be null. Backend product price validation requires a positive price and nonnegative stock.

The Vite proxy matches **`^/api/`**, so `/api-playground` remains a frontend route. `VITE_API_BASE_URL` can be blank, a backend origin, or an origin ending in `/api`; normalization prevents duplicated API path prefixes. See `.env.example`. A deployed static host needs SPA history fallback and an `/api/` reverse proxy, or a configured backend origin that permits the frontend origin. The production bundle does not include the development proxy.

## Honest hybrid demo state

Seed records are fictional Bangladesh-inspired fashion products with BDT prices. AppContext owns the local records separately from HTTP responses; no GET response is interpreted as persisted commerce data. Local/demo IDs and numeric controller **test IDs** are separate. Create requests do not assume returned database IDs, and no fake POST-to-PUT session chaining occurs.

| Result                                   | Frontend behavior                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| HTTP 2xx                                 | Local demo state updates; success says controller accepted the request; record marked `Controller validated` |
| HTTP 400 or other server error           | Inline/toast HTTP error; no successful local mutation, even when fallback is enabled                         |
| Network error / unavailable proxy target | `Backend Offline`; mutation fails unless Local Demo Fallback was explicitly enabled                          |
| Offline + enabled fallback               | Record stored locally as `Local / Unsynced`; never presented as database persistence                         |

Fallback defaults off each visit. API status is checked on initial load, explicit refresh, and real request responses; there is no polling loop. Passwords never enter localStorage. API Playground requests do not mutate demo records. Local moderation, plans, admins, permissions, settings, and activity log are explicitly UI-only.

Cart stores product IDs and quantities. Wishlist stores IDs. Invoices retain frontend item snapshots, customer details, subtotal/discount/total, date, and status. Their reference is explicitly local. No real payment, delivery, or backend Order–Product association occurs. Seller order visibility is inferred from local invoice items; order totals may span sellers.

Storage uses a versioned `tryonbd:demo:v1` key and handles corrupt/unavailable storage. Uploaded/captured photos and snapshots use object URLs in browser memory; serialization strips `blob:` and `data:` values. After a reload, history metadata survives but ephemeral image previews show an explanation. Object URLs are released when the app provider is destroyed.

## Virtual studio

Sunglasses use live MediaPipe face landmarks; clothing and jewelry retain manual overlay previews. Start AR Camera, allow access, and face the camera. Use After to capture the visible composite, Before to see the original, or Compare with the split slider. Fine tuning adjusts the automatic fit; disabling Auto Align explicitly switches sunglasses to manual placement.

- `@mediapipe/tasks-vision` **0.10.32**, official float16 Face Landmarker **version 1**, one face, confidence thresholds 0.5. GPU initialization automatically retries on CPU. `npm run setup:vision` copies matching WASM and downloads the model to `public/mediapipe`; inference has no CDN or backend dependency. API choices were checked against the [official browser guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js) and the installed TypeScript declarations (`detectForVideo(video, timestampMs)`).
- `CanvasPreview.jsx` owns the animation loop and composite rendering, `faceGeometry.js` owns fitting/smoothing, `useTryOnCamera.js` owns streams, and `faceLandmarker.js` owns the shared model. No detector is initialized during React rendering or on individual frames. Product/style changes reuse the current camera/model. Idle/manual/captured previews require no detector. Released models close after a one-second reuse window; late initialization and permission results are also cleaned up.
- VIDEO detection processes new decoded frames only, at up to 30 Hz; display rendering follows requestAnimationFrame. Transform refs use an adaptive EMA for center/shortest-arc roll and a separate 40 ms size filter (about 95% convergence in 120 ms). Face loss retains the last fit for 150 ms, then fades it over 120 ms. Reacquisition after expiry starts at the newly detected face. UI state changes only on status transitions.
- Eye corner pairs 33/133 and 362/263 are verified against MediaPipe's [official eye connections](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/python/solutions/face_mesh_connections.py). Normalized coordinates convert to the same mirrored canvas space as the camera. Canvas backing resolution preserves source aspect ratio, with a maximum side of 1280 pixels; CSS contains the canvas without cropping.
- Sunglasses width is recomputed from the face-side span (234–454) in canvas pixels. Final width = smoothed face span × product `widthMultiplier` × user Scale. Each style has independent fit/offset settings in `src/data/faceAccessories.js`. Put final transparent product PNG/WebP photographs in `public/assets/face-ar/sunglasses/` and configure `src`; see the [asset and distance-check guide](public/assets/face-ar/sunglasses/README.md). The loader crops alpha bounds once per asset, preserves aspect ratio, and uses high-quality smoothing at 100% default opacity. Existing illustrations are labeled fallbacks until real photographs are supplied. Frontend-only `tryOnAsset` and legacy `tryOnImageUrl` overrides remain outside backend DTOs.
- Capture AR Result is enabled in After when a face is tracked (or explicit manual fallback is selected). It copies the visible canvas, exports PNG with `toBlob`, and registers the Blob in AppContext. The original and immutable composite remain separate: captured glasses are never drawn twice, and no second inference can shift them. Retake/upload to adjust a capture; changing product/style clears the old capture. Save/download always export the After result even when Before/Compare is selected.
- Upload PNG/JPEG/WebP up to 12 MB. Sunglasses photos run IMAGE detection, with an explicit Auto Align/manual fallback if detection fails. Clothing/jewelry never load the model. Camera denial, absent/busy/disconnected devices, missing model/WASM, failed delegates and invalid images produce actionable inline feedback.
- Save posts exactly `{ userId, productId, inputImageUrl, tryOnType }`; sunglasses retain `FACE_AR`, manual modes use `CLOTHING`/`JEWELRY`. The input is an honest `urn:tryonbd:local-input:...` reference because the current controller validates text and does not upload/host photos. HTTP 2xx means controller validation; HTTP 400 never saves; offline offers explicit Save as Local Demo. Thumbnails stay in AppContext memory, and only metadata persists in localStorage. Cart uses the existing AppContext operation.

## Run and manually check sunglasses AR

Optional backend, in one PowerShell terminal (Java 21):

```powershell
Set-Location E:\AOOP\TryOnBD\backend
.\gradlew.bat bootRun
```

Frontend, in another terminal:

```powershell
Set-Location E:\AOOP\TryOnBD\frontend
npm install
npm run setup:vision
npm run dev
```

1. Open `http://127.0.0.1:5173/products/2`, choose **Try on virtually**, then **Start AR Camera** and allow camera access. Wait for **Face Tracking: Active**.
2. Face forward in good light. Check glasses sit across both eyes without touching any sliders. Move left/right and up/down; the mirrored image and glasses should move together. Move closer/farther to check size; tilt both ways to check roll.
3. Hold still to check jitter, then move naturally to assess responsiveness. Leave the frame: glasses should disappear in about 270 ms after the last detection. Return to reacquire. Repeat in the actual room/lighting used for the presentation.
4. Change the selected sunglasses/style while live. Tracking should continue without a new permission prompt. Skyline is out of stock in the seed catalog, so use Aero Aviator for the cart check.
5. Optionally adjust X/Y offset, Scale, Rotation and Opacity. Reset restores automatic defaults. Try Before and Compare, then return to After.
6. Select **Capture AR Result**. The camera indicator should switch off and the captured result should match the last visible composite. Download snapshot and open the PNG to confirm both face and glasses are present.
7. **Save Try-On** validates with Spring Boot when available; otherwise select **Save as Local Demo** after the offline message. Open demo history to inspect the result. **Add product to cart** should add Aero Aviator to the existing cart.
8. Retake, stop, restart, then switch to Clothing/Jewelry and navigate away. Check the browser camera indicator switches off each time. Both manual modes should still accept uploads and provide placement controls without face detection.
9. Deny camera access and verify the upload fallback. For a model failure check, block `/mediapipe/face_landmarker.task` in browser developer tools and reload; start AR, verify the error/manual fallback, unblock it, and Retry detection.
10. Repeat at a mobile viewport/device. Confirm the single preview fits without stretching or horizontal scrolling.

## Verification and limitations

Run `npm test`, `npm run build`, and `npm run test:browser` from `frontend`. Browser tests use installed Microsoft Edge. Tests cover real MediaPipe IMAGE inference and VIDEO inference on a transformed portrait streamed through canvas.captureStream, plus deterministic dependency mocks for GPU-to-CPU fallback, all-delegate failure, duplicate frames, lost/reacquired faces, captures, local history, cart, manual modes and cancellation while permission/model loading is pending. These are automated browser tests, not physical-webcam testing.

The preview is 2D and intended for near-front-facing use: no occlusion, 3D perspective or physical fit measurement. Main-thread MediaPipe inference can reduce responsiveness on slow devices; hardware webcam/mobile smoothness must be checked interactively. Model/WASM assets add roughly 26 MB before compression. Saved image previews last only for the current app visit; backend controllers do not persist data. Clothing/jewelry remain manual prototypes.

Next project task: **Real-time Shirt AR using MediaPipe Pose Landmarker**. After that: **Spring Data JPA + PostgreSQL entity/repository/service persistence** for the existing controllers.

## Image credits

Editorial/product photographs are bundled locally for reliable presentations, downloaded from these Unsplash image sources. No company logo assets are included. Overlay vectors and the demo portrait are original frontend illustrations.

- Editorial: `photo-1539109136881-3be0616acf4b`
- Portrait: `photo-1534528741775-53994a69daeb`
- Shirt: `photo-1598033129183-c4f50c736f10`
- Panjabi: `photo-1774527929835-282b1b85cd3a` — [Unsplash source](https://unsplash.com/photos/young-man-in-white-kurta-and-sunglasses-outdoors-ft69EMEADJw)
- Sunglasses: `photo-1511499767150-a48a237f0083`
- Necklace: `photo-1611652022419-a9419f74343d`
- Earrings: `photo-1535632066927-ab7c9ab60908`

Source format: `https://images.unsplash.com/{photo-id}`. Photos are illustrative demo imagery; fictional product names, sellers, and testimonials do not imply endorsements.
