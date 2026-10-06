# TryOnBD frontend implementation report

Completed entirely within `E:\AOOP\TryOnBD\frontend`.

## Delivered

| Area                     | Implementation                                                                                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public storefront        | Editorial homepage, local photography, category hierarchy, search, price/rating/mode filters, sorting, pagination, galleries, product/seller details, reviews, related products, newsletter demo                                                              |
| Cart and checkout        | Local drawer, quantities/removal/clear, stock limits, STYLE10 promo simulation, supported order DTO, local item lines, printable demo invoices                                                                                                                |
| Customer                 | Overview metrics, profile editing, orders and timeline, reviews/create/edit/delete, try-on history, wishlist, account preferences                                                                                                                             |
| Seller                   | Business profile, product create/edit/delete, stock and ratings, local order fulfillment, reviews, Recharts performance, UI-only Basic/Premium plans                                                                                                          |
| Admin                    | Users, sellers, local moderation, products, category hierarchy/CRUD, orders, review/session moderation, searchable/sortable/paginated tables, details and confirmation dialogs, reports                                                                       |
| Super Admin              | System overview, management and monitoring views, local admin entries, analytics, role/permission planning matrix, platform preferences, local activity log                                                                                                   |
| Try-on studio            | Camera start/stop/capture/retake, upload/remove, illustrated sample, real canvas overlays, position/scale/rotation/opacity/reset, before/after comparison, PNG downloads, staged clothing prototype, local session saves                                      |
| API Playground           | All 35 existing routes across seven resources; HTTP method/path, test ID, JSON editor, valid/invalid examples, send/loading, actual status/body/timing, copy response                                                                                         |
| Shared UI                | Buttons, icon buttons, labeled form controls/password toggle, dialogs/drawers, tabs, chips, product/stat/chart cards, tables, pagination, breadcrumbs, navigation/sidebar/footer, toast/skeleton/loading/empty/error states, avatars, dropdown, prices, stars |
| Responsive/accessibility | Desktop/mobile layouts, mobile filters/navigation/sidebar, table scrolling, keyboard tabs, native dialog focus handling, labels and focus styles, reduced-motion support                                                                                      |

## Routes, files, and dependencies

Public routes: `/`, `/products`, `/products/:id`, `/categories`, `/search`, `/try-on`, `/about`, `/login`, `/register`, `/seller-register`, `/forgot-password`, `/reset-password`, `/checkout`, `/invoice/:id`, `/api-playground`, and 404 fallback.

Dashboard routes: `/dashboard/customer`, `/dashboard/seller`, `/dashboard/admin`, `/dashboard/super-admin`, plus their section routes. All section names and paths are centralized in `src/data/dashboardConfig.js`.

The source is organized into `components/{common,dashboard,layout,product,tryon}`, `context`, `data/mock`, `hooks`, `layouts`, `pages`, `services`, and `utils`, with local assets in `public/assets`. There are 44 source files. See [README.md](README.md) for the complete architecture and route table.

Installed runtime packages: `react`, `react-dom`, `react-router-dom`, `axios`, `lucide-react`, `recharts`. Development packages: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`, `@playwright/test`, `prettier`. No TypeScript source, AI model, Python service, or additional backend was added.

Seven dedicated service files: `userService.js`, `sellerService.js`, `productService.js`, `categoryService.js`, `tryOnService.js`, `reviewService.js`, `orderService.js`. Axios and DTO whitelists are centralized. Every existing GET/list, GET/by-ID, POST, PUT, and DELETE route is connected through these services and the Playground; orders use `/status`, and try-on result updates use `/result`.

## Data integrity and feature classification

- Fictional seed records, React Context, and versioned localStorage are separate from live HTTP responses.
- HTTP 2xx means **controller validation succeeded**; it does not imply database persistence.
- HTTP 400 cannot create a successful local record, even with fallback enabled.
- Offline mutations require an explicit Local Demo Fallback selection and produce **Local / Unsynced** records.
- Passwords, base64 images, and blob URLs are excluded from localStorage. Photo previews stay in memory.
- Cart, wishlist, invoice items, authentication, role switching, analytics, moderation, plans, settings, admin entries, permissions, and activity logs are frontend demonstrations.
- Future work remains database persistence, backend authentication/authorization, real AI clothing/face/pose engines, hosted images, payments, shipping, subscription billing, and persisted order items.

## Verification results

| Check                      | Result                                                                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`            | **PASS** — production bundle generated in `frontend/dist`                                                                                                                                                                                       |
| `npm test`                 | **5 passed** — endpoint inventory, exact DTOs, API URL normalization, image/password serialization, storage failures                                                                                                                            |
| `npm run test:browser`     | **14 passed** — all routes, mobile overflow/navigation, filtering/wishlist, checkout/invoices, rejected/offline mutations, edit DTOs, canvas/download/session storage, camera denial/capture/cleanup, Playground, registration/onboarding, CRUD |
| `npm run format:check`     | **PASS**                                                                                                                                                                                                                                        |
| npm dependency audit       | **0 vulnerabilities** after dependency updates                                                                                                                                                                                                  |
| Runtime inspection         | No JavaScript page exceptions in route tests or screenshot capture                                                                                                                                                                              |
| Local presentation imagery | All homepage images loaded in the screenshot check                                                                                                                                                                                              |
| TypeScript                 | No authored `.ts` or `.tsx` files                                                                                                                                                                                                               |
| Backend preservation       | **All 172 backend files match their original SHA-256 hashes**                                                                                                                                                                                   |

Spring Boot was **offline on port 8080** during verification. The real proxy/offline behavior was checked. Successful and invalid controller-response scenarios were exercised with explicit Playwright request interception; live successful Spring Boot validation is not claimed. Camera capture/cleanup used a simulated browser media stream; real camera use still requires hardware and permission.

Desktop/mobile screenshots are saved in `artifacts/`: `home-desktop.png`, `home-mobile.png`, `studio-desktop.png`, and `dashboard-desktop.png`.

## Start

```powershell
cd E:\AOOP\TryOnBD\frontend
npm run dev
```

Frontend: `http://127.0.0.1:5173`. Vite proxies only `^/api/` to `http://localhost:8080`; `/api-playground` remains a frontend page. Environment and production hosting instructions are in [README.md](README.md).
