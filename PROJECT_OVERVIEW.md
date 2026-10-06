# TryOnBD — Advanced Features & Complete Project Overview

## 1. Advanced Core Features

TryOnBD is not only a virtual try-on demo. It is a **full role-based e-commerce platform** that combines secure authentication, database persistence, backend authorization, real product ownership, and computer-vision-based virtual fitting.

### 1.1 JWT Authentication & Spring Security
- JWT-based login authentication
- Spring Security integration
- BCrypt password hashing
- Token-based authenticated API access
- Role information carried and validated through backend authentication
- Protected frontend routes
- Protected backend APIs
- Logout and authenticated session handling
- Role-matched login validation

Supported roles:
- CUSTOMER
- SELLER
- ADMIN
- SUPER_ADMIN

A user cannot enter another role only by changing the frontend selector. The selected role must match the authenticated backend/JWT role.

### 1.2 Role-Based Access Control
Authorization is enforced at backend level.

Examples:
- Customer cannot access Seller/Admin/Super Admin routes
- Seller cannot access Admin/Super Admin routes
- Admin cannot access Super Admin-only controls
- Super Admin receives privileged system access

This makes the system more secure than frontend-only role switching.

### 1.3 PostgreSQL + Spring Data JPA
The project uses PostgreSQL for real persistent application data.

Core entities:
1. USER
2. SELLER
3. PRODUCT
4. CATEGORY
5. TRY_ON_SESSION
6. CART
7. ORDER

Spring Data JPA is used to connect the Spring Boot backend with PostgreSQL.

### 1.4 Backend-Driven Architecture
The frontend is connected to REST APIs instead of depending only on mock data.

Backend-driven data includes:
- Users
- Sellers
- Products
- Categories
- Cart
- Orders
- Try-on sessions
- Role-specific account data

### 1.5 Product-Driven AR Architecture
The virtual try-on renderer is selected according to product metadata.

```text
EYEWEAR  → Eyewear AR Engine
NECKLACE → Necklace AR Engine
SHIRT    → Shirt AR Engine
```

This avoids creating separate hardcoded try-on logic for every product.

### 1.6 MediaPipe Computer Vision
MediaPipe Tasks Vision is used for:
- Face landmarks
- Iris/eye references
- Head pose references
- Shoulder tracking
- Torso tracking
- Neck/face reference points
- Pose-aware fitting

### 1.7 WebGL Eyewear Rendering
The eyewear module includes:
- WebGL-based rendering
- Dynamic frame scale
- Head-turn-aware fitting
- Bridge alignment
- Lens/eye alignment
- Hinge-based temple attachment
- Side-arm/temple fitting
- Ear-side fitting
- Head/face occlusion
- Product-specific fitting profiles

### 1.8 PD-Assisted Eyewear Fitting
PD (Pupillary Distance) is used as an additional fitting signal.

Features:
- Estimated PD from face/iris landmarks
- Smoothed PD value
- Manual PD override
- `PD --` when tracking is unreliable
- PD-assisted frame scale stabilization

PD improves:
- Frame width
- Eye/lens alignment
- Bridge position
- Hinge spacing
- Overall fitting stability

### 1.9 Pose-Aware Shirt Try-On
The shirt system uses upper-body pose landmarks.

Features:
- Shoulder tracking
- Torso tracking
- Dynamic position
- Dynamic scale
- Uploaded-photo fitting
- Full-photo contain rendering
- Landmark remapping to the displayed image area

### 1.10 Necklace Tracking Engine
The necklace module combines:
- Shoulder scale
- Shoulder rotation
- Neck anchor
- Face reference
- Tracking smoothing
- Pose-loss handling
- Product-specific style

Supported styles:
- CHOKER
- SHORT
- PENDANT

### 1.11 Product Details Try-On Modal
Virtual fitting is integrated directly into Product Details.

Flow:

`Product Details → Try Virtually → AR Modal`

Features:
- Live camera
- Upload photo
- Capture/download
- Fullscreen
- Close/Escape
- Product-aware AR renderer
- Camera cleanup
- Product page remains visible behind the modal

### 1.12 Real Seller Ownership
Seller products are linked through backend ownership.

Anzara:
- Seller ID: 2
- Own backend products
- Seller-specific dashboard
- Product count
- Price
- Stock
- Category
- AR type

### 1.13 Realistic Backend-Connected Cart
The customer cart includes:
- Product image
- Product name
- Unit price
- Quantity
- Increase/decrease controls
- Remove item
- Stock-aware quantity limits
- Line total
- Subtotal
- Estimated total
- Continue Shopping
- Proceed to Checkout
- Empty/loading/error states

### 1.14 Admin & Super Admin Security
Admin and Super Admin are separate roles.

Admin:
- System overview
- Users
- Sellers
- Products
- Categories
- Orders
- Try-on session information where supported

Super Admin:
- Higher-level system access
- Admin-management controls
- Privileged role-management operations
- System-wide data visibility

### 1.15 Idempotent Demo Account Seeding
Demo accounts can be seeded without creating duplicates.

Accounts:
- Customer
- Seller
- Admin
- Super Admin

Repeated seeding keeps accounts unique.

### 1.16 Reusable Product Asset & Ingestion System
Product assets follow a standardized structure and can contain:
- Front image
- Temple assets
- Gallery images
- Product metadata
- AR metadata
- Fitting configuration

A reusable sync/ingestion workflow supports future product expansion.

---

# 2. Project Summary

**TryOnBD** is a virtual try-on and e-commerce platform that combines:

- React frontend
- Spring Boot backend
- PostgreSQL database
- JWT authentication
- Role-based authorization
- Computer vision
- WebGL/Canvas rendering
- Product ownership
- Cart and checkout
- Admin management

The project is designed as an integrated software system rather than a standalone AR prototype.

---

# 3. Technology Stack

## Frontend
- React
- Vite
- JavaScript
- React Router
- Axios
- Tailwind CSS / responsive styling
- MediaPipe Tasks Vision
- Canvas
- WebGL

## Backend
- Java 21
- Spring Boot 4.0.8
- Spring Security
- JWT
- Spring Data JPA
- Gradle

## Database
- PostgreSQL
- Database: `tryonbd`
- Development port: `5433`

---

# 4. Customer Features

Customers can:
- Login securely
- Browse products
- View Product Details
- Use virtual try-on
- View product gallery
- Add products to cart
- Update quantity
- Remove cart items
- View subtotal
- Checkout
- Create orders
- Logout securely

---

# 5. Seller Features

## Anzara Seller

Seller dashboard includes:
- Seller identity
- Product count
- Seller-owned products
- Product image
- Product name
- Price
- Stock
- Category
- AR type

Existing Anzara products include:
- Silver Diamond Necklace
- Royal Gold Choker
- Golden Frame
---

# 6. Admin Features

Route:

`/admin/dashboard`

Admin can access backend-driven system data while remaining restricted from Super Admin-only operations.

---

# 7. Super Admin Features

Route:

`/super-admin/dashboard`

Super Admin receives the highest administrative access in the application.

---

# 8. Customer

# 9. Product Catalog & Gallery

Product information includes:
- ID
- Name
- Description
- Price
- Stock
- Category
- Seller
- Product image
- AR type
- AR metadata

Gallery features:
- Multiple images
- Thumbnail switching
- Hover zoom
- Lightbox
- Responsive layout

---

# 10. Virtual Try-On Products

Examples currently integrated:

## Clothing
- Black T-Shirt

## Eyewear
- Modern Clear Frame
- Classic Aviator
- Golden Frame

## Jewelry
- Silver Diamond Necklace
- Royal Gold Choker

---

# 11. Product Asset Architecture

```text
frontend/public/assets/products/

clothing/
  black-t-shirt/

eyewear/
  modern-clear-frame/
  classic-aviator/
  golden-frame/

jewelry/
  silver-diamond-necklace/
  royal-gold-choker/
```

---

# 12. Complete Demo Flow

## Customer
`Login → Storefront → Product Details → Virtual Try-On → Cart → Checkout`

## Seller
`Login as Anzara → Seller Dashboard → Seller-Owned Products`

## Admin
`Login → Admin Dashboard → System Data`

## Super Admin
`Login → Super Admin Dashboard → Privileged Controls`

---

# 13. Major Engineering Work Completed

- React frontend
- Spring Boot backend
- REST API integration
- PostgreSQL persistence
- Spring Data JPA
- JWT authentication
- Spring Security
- BCrypt password hashing
- Role-based authorization
- Product ownership
- Customer cart
- Checkout
- Order persistence
- Seller dashboard
- Admin dashboard
- Super Admin dashboard
- WebGL eyewear fitting
- Face/head occlusion
- Temple/ear-side fitting
- PD-assisted eyewear calibration
- Pose-aware shirt fitting
- Full-photo upload fitting
- Necklace fitting
- Product Details AR modal
- Product gallery
- Product asset ingestion
- Product normalization
- Demo account seeding
- Backend security validation
- Frontend build validation
- Browser flow validation

---

# 14. Current Limitations / Future Scope

Possible future improvements:
- Full physics-based 3D cloth simulation
- CAD-based 3D eyewear
- More accurate ear detection
- Production-grade optical PD measurement
- Payment gateway
- Shipping provider integration
- Advanced seller analytics
- Recommendation engine
- User activation/deactivation
- Cloud deployment
- CDN/object storage

---

# 15. Conclusion

TryOnBD demonstrates the integration of:

- Object-oriented backend development
- Secure JWT authentication
- Spring Security
- PostgreSQL persistence
- Computer vision
- WebGL-based AR fitting
- Role-based e-commerce
- Seller ownership
- Cart and checkout
- Administrative management

The project is designed to be reusable, extensible, and suitable for future expansion beyond the current university project scope.
