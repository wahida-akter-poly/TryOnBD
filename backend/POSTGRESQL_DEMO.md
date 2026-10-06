# PostgreSQL demo

The backend uses Spring Data JPA and a real PostgreSQL database. The frontend AR files are unchanged.

## Prepared portable PostgreSQL on this computer

A real PostgreSQL 17.6 server is stored in ../.local-postgres (ignored by Git), with durable data in ../.local-postgres/data. It listens only on 127.0.0.1:5432. Development username/password: postgres/postgres. No Windows service is installed.
The backend's configured database default is 127.0.0.1:5433. To use this portable development server instead, set `DB_URL` to `jdbc:postgresql://127.0.0.1:5432/tryonbd`.

From the backend folder, start the database when it is stopped:

```powershell
& ..\.local-postgres\runtime\bin\pg_ctl.exe -D E:/AOOP/TryOnBD/.local-postgres/data -l E:/AOOP/TryOnBD/.local-postgres/postgres.log -o "-h 127.0.0.1 -p 5432" -w start
```

Create the database once if necessary:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\database.ps1 -Database postgres -Sql "CREATE DATABASE tryonbd"
```

Inspect real PostgreSQL tables and rows using the bundled JDBC helper (no psql installation needed):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\database.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\database.ps1 -Sql "SELECT id, name, price, ar_type FROM products"
powershell -NoProfile -ExecutionPolicy Bypass -File .\database.ps1 -Sql "SELECT id, full_name, email FROM users"
powershell -NoProfile -ExecutionPolicy Bypass -File .\database.ps1 -Sql "SELECT * FROM categories"
```

This helper sends SQL directly to PostgreSQL. The portable package contains the server and pg_ctl but not psql. If psql is installed separately, the psql commands below work unchanged.

Start the already-built backend quickly:

```powershell
$env:DB_URL = "jdbc:postgresql://127.0.0.1:5433/tryonbd"
$env:DB_USERNAME = "postgres"
$env:DB_PASSWORD = "postgres"
java -XX:TieredStopAtLevel=1 -jar .\build\libs\tryonbd-backend-0.0.1-SNAPSHOT.jar
```

## 1. Create the database

With a PostgreSQL installation, add its bin folder to PATH (adjust version/path):

```powershell
$env:Path = "C:\Program Files\PostgreSQL\17\bin;$env:Path"
Set-Location E:\AOOP\TryOnBD\backend
psql -h 127.0.0.1 -p 5433 -U postgres -W -d postgres -f .\database_setup.sql
```

Run this only once. If the database already exists, keep it. Do not run CREATE DATABASE in a transaction.

## 2. Set credentials and run

```powershell
Set-Location E:\AOOP\TryOnBD\backend
$env:DB_URL = "jdbc:postgresql://127.0.0.1:5433/tryonbd"
$env:DB_USERNAME = "postgres"
$env:DB_PASSWORD = Read-Host "PostgreSQL password"
.\gradlew.bat bootRun
```

Defaults are 127.0.0.1:5433 / tryonbd / postgres / postgres. Normal startup does not seed demo data.

### Seed demo customer and existing Anzara seller

Run the opt-in seed profile against the existing database. It creates or updates the two BCrypt-backed
login users, links the seller user to existing Seller ID 2, and never creates a seller record. Stop
the process after `Demo accounts ready` appears, then start the backend normally:

```powershell
$env:DB_URL = "jdbc:postgresql://127.0.0.1:5433/tryonbd"
$env:DB_USERNAME = "postgres"
$env:DB_PASSWORD = "postgres"
.\gradlew.bat bootRun --args="--spring.profiles.active=demo-seed --server.port=8082"
```

The seed is idempotent and refuses to proceed if Seller ID 2 is not Anzara or either demo user has
an incompatible seller-profile link. Demo logins: `customer@tryonbd.demo` / `Customer@123` and
`anzara@tryonbd.demo` / `Anzara@123`.

Look for Hikari PostgreSQL connection, Hibernate EntityManagerFactory initialization, and Tomcat on port 8080.

## 3. Inspect the seven tables

```powershell
psql -h 127.0.0.1 -p 5433 -U postgres -W -d tryonbd -c "\dt"
psql -h 127.0.0.1 -p 5433 -U postgres -W -d tryonbd -c "SELECT id, name, price, ar_type, category_id, seller_id FROM products;"
psql -h 127.0.0.1 -p 5433 -U postgres -W -d tryonbd -c "SELECT id, full_name, email FROM users;"
```

Interactive psql commands:

```sql
\c tryonbd
\dt
SELECT * FROM products;
SELECT id, full_name, email, role FROM users;
SELECT * FROM categories;
SELECT * FROM sellers;
SELECT * FROM try_on_sessions;
SELECT * FROM carts;
SELECT * FROM orders;
```

Tables are exactly: users, sellers, categories, products, try_on_sessions, carts, orders.
Seller also references its user, preserving the original seller request contract.
Cart permits multiple carts per user. No cart-item, order-item, or review entity was added.
The existing review routes remain the previous placeholder implementation and are outside this database demo.

## 4. Show these GET URLs

- http://localhost:8080/api/products
- http://localhost:8080/api/users
- http://localhost:8080/api/categories
- http://localhost:8080/api/sellers
- http://localhost:8080/api/try-on-sessions
- http://localhost:8080/api/carts
- http://localhost:8080/api/orders

All seven collections support POST and GET; each supports GET /{id} and DELETE /{id}.
Existing PUT routes are preserved, including /try-on-sessions/{id}/result and /orders/{id}/status.
POST returns 201 with a Location header; DELETE returns 204; missing IDs return 404;
duplicate emails and foreign-key conflicts return 409. Passwords are BCrypt hashes and never returned.
Money is BigDecimal. Related IDs are validated by looking up real database records.

## 5. Create and retrieve real records

In a second PowerShell window:

```powershell
$api = "http://localhost:8080/api"
$category = Invoke-RestMethod "$api/categories" -Method Post -ContentType "application/json" -Body '{"categoryName":"Persistence Proof","description":"Created live during the PostgreSQL demonstration"}'
$proofId = $category.id
Invoke-RestMethod "$api/categories/$proofId"
$user = (Invoke-RestMethod "$api/users")[0]
$product = (Invoke-RestMethod "$api/products")[0]
Invoke-RestMethod "$api/carts" -Method Post -ContentType "application/json" -Body (@{userId=$user.id} | ConvertTo-Json)
Invoke-RestMethod "$api/orders" -Method Post -ContentType "application/json" -Body (@{userId=$user.id;totalAmount=690;orderStatus="pending"} | ConvertTo-Json)
Invoke-RestMethod "$api/try-on-sessions" -Method Post -ContentType "application/json" -Body (@{userId=$user.id;productId=$product.id;inputImageUrl="/demo/input.jpg";tryOnType="tshirt"} | ConvertTo-Json)
```

Use existing request fields: fullName, categoryName, contactEmail, subscriptionStatus, tryOnType,
inputImageUrl, resultImageUrl, orderStatus. Product requests additionally accept description and arType.
The frontend API request examples remain valid with existing related IDs.

## 6. Two-minute demonstration (after the server is running)

1. 0:00-0:20: Open products and show the two seed products.
2. 0:20-0:40: Run psql \dt and SELECT from products: show real PostgreSQL tables and rows.
3. 0:40-1:00: POST the Persistence Proof category above; note its returned ID.
4. 1:00-1:40: Stop Spring Boot with Ctrl+C and run the same startup command.
5. 1:40-2:00: In the second PowerShell window, GET "$api/categories/$proofId" again.
   Its original ID and description survive the restart. A SELECT from categories confirms the same row.

## Tests

Controller tests run without a database:

```powershell
.\gradlew.bat test
```

For the full test suite including actual PostgreSQL connection, seven-entity assertion,
repository save/flush/clear/read/delete checks, use the same DB_* variables and:

```powershell
$env:RUN_POSTGRES_TESTS = "true"
.\gradlew.bat test --rerun-tasks
```

Database tests use rollback transactions. They require a running PostgreSQL instance.
