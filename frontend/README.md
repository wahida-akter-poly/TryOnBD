# TryOnBD frontend

A complete JavaScript React demonstration of a Bangladeshi fashion storefront, manual virtual try-on studio, four dashboard experiences, and the existing Spring Boot controller milestone.

All project changes are confined to `frontend/`. The backend was inspected read-only to verify endpoint contracts. No backend code, Gradle configuration, tests, database configuration, ERD, or root files were changed.

## Run

```powershell
cd E:\AOOP\TryOnBD\frontend
npm install
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
| `/try-on`                                 | Dark camera/upload and manual canvas studio                                                                                                        |
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

- Select clothing, sunglasses, or jewelry and choose a product.
- Camera start/stop, permission/unavailable errors, capture, retake; upload PNG/JPEG/WebP up to 12 MB, remove, or use the bundled illustrated portrait.
- Real 720×900 HTML canvas with X/Y position, scale, rotation, opacity, reset, before/after, comparison slider, and PNG download.
- Locally drawn glasses, necklace, earrings, and garment overlays. These are illustrative assets, not exact product image segmentation.
- Clothing uses staged **Prototype / Demo Processing**, not a machine-learning model. Face landmarks, pose estimation, auto alignment, and AI clothing generation remain future features.
- Save session validates the supported DTO and stores local metadata and memory-only previews. An illustrative URL is sent for uploads because no image hosting endpoint exists. No photo bytes are uploaded to Spring Boot.

## Verification and limitations

`npm test` checks all 35 routes, exact DTO boundaries, base-URL normalization, safe image/password serialization, and storage failures. Browser tests cover public/dashboard routes, desktop/mobile overflow, navigation, filtering/wishlist, checkout/invoices, HTTP 400 rejection, explicit offline fallback, profile/product payloads, canvas pixels/downloads/session saving, denied camera access, and Playground 200/400/offline feedback.

Most successful/invalid API response scenarios use Playwright interception to isolate frontend behavior. A separate test checks the real configured proxy. Spring Boot was unavailable on port 8080 during implementation, so live successful controller validation was not claimed. Physical camera capture requires a camera and browser permission. Denial, upload, capture, and media-track cleanup are automated using a simulated browser media stream.

Future work: service/repository/database persistence; real backend authentication and authorization; persisted roles; real AI/AR; image hosting; payment and shipping; Order–Product item association; subscription billing; secure audit logs. All analytics/revenue/commission scenarios are explicitly simulated. Product photography is representative, not actual inventory photography.

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
