# TryOnBD

**TryOnBD** is a role-based virtual try-on and e-commerce platform that combines secure authentication, PostgreSQL-backed commerce, seller ownership, and computer-vision-based AR fitting for eyewear, shirts, and necklaces.

The system integrates a **React frontend**, **Spring Boot backend**, **PostgreSQL database**, **JWT/Spring Security authentication**, **MediaPipe computer vision**, and **WebGL/Canvas-based virtual try-on**.

---

## Core Features

- JWT Authentication + Spring Security
- BCrypt password hashing
- Role-Based Access Control
- CUSTOMER / SELLER / ADMIN / SUPER_ADMIN
- PostgreSQL + Spring Data JPA
- Backend-driven product catalog
- Product ownership and seller-specific access
- Realistic customer cart and checkout
- Product Details virtual try-on modal
- MediaPipe face and pose tracking
- WebGL eyewear rendering
- PD-assisted eyewear fitting
- Head pose, temple fitting and face occlusion
- Pose-aware shirt virtual try-on
- Full-photo shirt fitting
- Necklace virtual try-on
- Product gallery, zoom and lightbox
- Admin and Super Admin dashboards
- Reusable product asset ingestion and AR metadata architecture

---

## Virtual Try-On Modules

### Eyewear
Face-aware virtual fitting with:

- face landmarks
- head pose estimation
- bridge and lens alignment
- WebGL rendering
- temple / side-arm fitting
- ear-side positioning
- head/face occlusion
- PD-assisted scale calibration

### Shirt
Pose-aware 2.5D fitting using shoulder and torso landmarks.

Supports:

- live camera
- uploaded photos
- full-body portrait images
- dynamic scale and positioning

### Necklace
Neck and shoulder based fitting supporting:

- CHOKER
- SHORT
- PENDANT

---

## Role-Based System

### Customer
Customers can browse products, use virtual try-on, manage their cart, check out, and place orders.

### Seller
Sellers receive a dedicated dashboard that shows only their products.

The current demo seller **Anzara** is connected to real backend ownership data.

### Admin
Admin receives system-level access to users, sellers, products, categories, orders, and other supported management information.

### Super Admin
Super Admin receives additional privileged administrative controls and higher-level role management.

---

## Technology Stack

**Frontend**
- React
- Vite
- JavaScript
- React Router
- Axios
- MediaPipe Tasks Vision
- Canvas / WebGL

**Backend**
- Java 21
- Spring Boot 4.0.8
- Spring Security
- JWT
- Spring Data JPA
- Gradle

**Database**
- PostgreSQL

---

## Core Database Entities

The current persistence architecture contains seven main entities:

1. USER
2. SELLER
3. PRODUCT
4. CATEGORY
5. TRY_ON_SESSION
6. CART
7. ORDER

---

## Product-Driven AR Architecture

The virtual try-on engine is selected from product metadata:

```text
EYEWEAR  → Eyewear AR Engine
NECKLACE → Necklace AR Engine
SHIRT    → Shirt AR Engine
