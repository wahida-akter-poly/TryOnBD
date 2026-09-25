# TryOnBD Backend

TryOnBD is our AOOP project for a virtual try-on based e-commerce system.  
This repository currently contains the Spring Boot backend work for the project.

## Current Project Update

For the current submission, I completed the controller and request object part of the backend.

Current work includes:

- 7 Controllers
- 14 Request DTO classes
- 35 API endpoints
- Request validation using Jakarta Validation
- Automated controller/request tests
- Manual API testing using Thunder Client

The project is running with:

- Java 21
- Spring Boot 4.0.8
- Gradle 9.7.1

## Main Modules

The current ERD contains 7 main modules:

- User
- Seller
- Product
- Category
- Try On Session
- Review
- Order

## Controllers and Request Objects

| Module | Controller | Create Request | Update Request |
| --- | --- | --- | --- |
| User | `UserController` | `CreateUserRequest` | `UpdateUserRequest` |
| Seller | `SellerController` | `CreateSellerRequest` | `UpdateSellerRequest` |
| Product | `ProductController` | `CreateProductRequest` | `UpdateProductRequest` |
| Category | `CategoryController` | `CreateCategoryRequest` | `UpdateCategoryRequest` |
| Try On Session | `TryOnSessionController` | `CreateTryOnSessionRequest` | `UpdateTryOnResultRequest` |
| Review | `ReviewController` | `CreateReviewRequest` | `UpdateReviewRequest` |
| Order | `OrderController` | `CreateOrderRequest` | `UpdateOrderStatusRequest` |

## API Structure

Each controller currently has basic REST endpoints for create, read, update and delete operations.

Example:

```text
POST   /api/products
GET    /api/products
GET    /api/products/{id}
PUT    /api/products/{id}
DELETE /api/products/{id}
```

Special update endpoints:

```text
PUT /api/try-on-sessions/{id}/result
PUT /api/orders/{id}/status
```

Total endpoints: **35**

## Request Validation

Request DTOs are used so that client input is handled separately from future database entities.

Examples of validation used:

- `@NotBlank`
- `@NotNull`
- `@Email`
- `@Size`
- `@Positive`
- `@PositiveOrZero`
- `@Min`
- `@Max`

For example, review rating only accepts values from 1 to 5.

## Testing

I tested the controller and request object layer in two ways.

### Automated Test

```powershell
.\gradlew.bat build
```

Current result:

```text
44 tests passed
0 failures
BUILD SUCCESSFUL
```

### Manual Test

I also tested the APIs using Thunder Client.

Tested examples include:

- User creation
- User validation error
- Seller creation
- Product creation
- Category creation with `parentCategoryId = null`
- Try-on session creation
- Try-on result update
- Review creation
- Invalid review rating
- Order creation
- Order status update

## Current Flow

```text
JSON Request
    ↓
Request DTO
    ↓
Validation
    ↓
Controller
```

The next step will add:

```text
Controller
    ↓
Service
    ↓
Repository
    ↓
Database
```

## Important Note for Next Phase

The ERD contains an `ORDER` to `PRODUCT` many-to-many relationship.

In the next Service and Database phase, this will be implemented using product references or an `OrderItem` style structure.

The current controller/request submission is kept unchanged for this milestone.

## Run the Project

From the backend folder:

```powershell
.\gradlew.bat bootRun
```

The application runs on:

```text
http://localhost:8080
```

## Next Work

The next planned work is:

- Service layer
- Entity classes
- Repository layer
- Database integration
- UI development
- Authentication
- Virtual try-on integration
