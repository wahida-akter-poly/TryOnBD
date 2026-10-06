package com.tryonbd.backend;
import com.tryonbd.backend.model.*;
import com.tryonbd.backend.repository.*;
import com.tryonbd.backend.config.JwtService;
import java.math.BigDecimal;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;
@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:production;MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "spring.datasource.driver-class-name=org.h2.Driver", "spring.jpa.hibernate.ddl-auto=create-drop"})
@Transactional
class ControllerRequestTests {
 @Autowired WebApplicationContext context;
 @Autowired UserRepository users; @Autowired SellerRepository sellers; @Autowired CategoryRepository categories; @Autowired ProductRepository products;
 @Autowired OrderRepository orders; @Autowired CartRepository carts; @Autowired TryOnSessionRepository sessions; @Autowired JwtService jwt;
 @Autowired jakarta.persistence.EntityManager entityManager;
 @Autowired com.tryonbd.backend.service.NecklaceCatalogImportService necklaceImporter;
 MockMvc mvc; User customer,other,sellerUser,admin,superAdmin; Seller seller,otherSeller; Product product; Category category;
 User user(String role,String email){User u=new User();u.setFullName(role);u.setEmail(email);u.setPassword(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("secret123"));u.setRole(role);u.setPhone("01700000000");u.setAddress("Dhaka");return users.save(u);}
 Seller seller(User u){Seller s=new Seller();s.setUser(u);s.setBusinessName("Test Store");s.setContactEmail(u.getEmail());s.setPhone("01700000000");s.setSubscriptionStatus("ACTIVE");return sellers.save(s);}
 String token(User u){return "Bearer "+jwt.generateToken(u.getId(),u.getEmail(),u.getRole());}
 @BeforeEach void setup(){mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();customer=user("CUSTOMER","customer@test.example");other=user("CUSTOMER","other@test.example");sellerUser=user("SELLER","seller@test.example");admin=user("ADMIN","admin@test.example");superAdmin=user("SUPER_ADMIN","super@test.example");seller=seller(sellerUser);otherSeller=seller(other);category=new Category();category.setCategoryName("Clothing");category.setDescription("Test category");categories.save(category);product=new Product();product.setName("Test Shirt");product.setArType("SHIRT");product.setPrice(new BigDecimal("12.50"));product.setStockQuantity(5);product.setCategory(category);product.setSeller(seller);products.save(product);}
 @Autowired com.tryonbd.backend.service.ProductAssetSyncService productSync;
 @Test void genuineGoldenManifestUsesGenericCommerceAndManagementWithoutLosingFitMetadata() throws Exception {
   var source=com.tryonbd.backend.service.ProductAssetPackage.discover(java.nio.file.Path.of("../frontend/public/assets/products"))
     .stream().filter(p->p.key().equals("eyewear/golden-frame")).findFirst().orElseThrow();
   var sourceFit=(java.util.Map<?,?>)source.arMetadata().get("fitProfile");
   // Legitimate seller principal in the isolated H2 database; production ownership is untouched.
   var pkg=new com.tryonbd.backend.service.ProductAssetPackage(source.key(),false,seller.getId(),null,
     source.name(),source.description(),source.price(),source.stockQuantity(),source.category(),source.arType(),source.imageUrl(),source.arMetadata());
   var id=productSync.sync(java.util.List.of(pkg),null,false).getFirst().productId();
   var golden=products.findById(id).orElseThrow();
   mvc.perform(get("/api/products/"+id)).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Golden Frame"))
     .andExpect(jsonPath("$.arMetadata.leftTempleAsset").value(source.arMetadata().get("leftTempleAsset")));
   mvc.perform(get("/api/account/products").header("Authorization",token(sellerUser))).andExpect(status().isOk())
     .andExpect(content().string(org.hamcrest.Matchers.containsString("Golden Frame")));
   String body="{\"name\":\"Golden Frame\",\"description\":\""+source.description()+"\",\"price\":2199,\"stockQuantity\":15,\"arType\":\"EYEWEAR\",\"imageUrl\":\""+source.imageUrl()+"\",\"categoryId\":"+golden.getCategory().getId()+",\"sellerId\":"+seller.getId()+"}";
   for(var role:java.util.List.of(sellerUser,admin,superAdmin)) {
     mvc.perform(put("/api/products/"+id).header("Authorization",token(role)).contentType("application/json").content(body))
       .andExpect(status().isOk()).andExpect(jsonPath("$.arMetadata.fitProfile.templeDepth").value(sourceFit.get("templeDepth")));
     assertEquals(source.arMetadata(),products.findById(id).orElseThrow().getArMetadata());
   }
   mvc.perform(post("/api/account/cart/"+id).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":2}"))
     .andExpect(status().isOk()).andExpect(jsonPath("$."+id).value(2));
   mvc.perform(put("/api/account/cart/"+id).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":16}"))
     .andExpect(status().isConflict());
   mvc.perform(post("/api/account/checkout").header("Authorization",token(customer))).andExpect(status().isOk())
     .andExpect(jsonPath("$.totalAmount").value(4398)).andExpect(jsonPath("$.items[0].productId").value(id));
   assertEquals(13,products.findById(id).orElseThrow().getStockQuantity());
   assertEquals(new BigDecimal("12.50"),products.findById(product.getId()).orElseThrow().getPrice());
 }
 @Test void catalogIsPublicAndMissingProductIs404() throws Exception {mvc.perform(get("/api/products")).andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Test Shirt"));mvc.perform(get("/api/categories")).andExpect(status().isOk());mvc.perform(get("/api/products/999999")).andExpect(status().isNotFound());}
 @Test void protectedEndpointsRequireJwtAndCustomerCannotManage() throws Exception {mvc.perform(get("/api/account/cart")).andExpect(status().isUnauthorized());mvc.perform(get("/api/account/me").header("Authorization","Bearer invalid")).andExpect(status().isUnauthorized());mvc.perform(get("/api/users").header("Authorization",token(customer))).andExpect(status().isForbidden());mvc.perform(delete("/api/products/"+product.getId()).header("Authorization",token(customer))).andExpect(status().isForbidden());mvc.perform(get("/api/users").header("Authorization",token(admin))).andExpect(status().isOk());}
 @Test void cartAndCheckoutUsePrincipalAndServerPrices() throws Exception {mvc.perform(put("/api/account/cart/"+product.getId()).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":2}")).andExpect(status().isOk());mvc.perform(get("/api/account/cart").header("Authorization",token(other))).andExpect(content().json("{}"));mvc.perform(post("/api/account/checkout").header("Authorization",token(customer))).andExpect(status().isOk()).andExpect(jsonPath("$.totalAmount").value(25)).andExpect(jsonPath("$.userId").value(customer.getId())).andExpect(jsonPath("$.items[0].quantity").value(2));assertEquals(3,products.findById(product.getId()).orElseThrow().getStockQuantity());mvc.perform(get("/api/account/cart").header("Authorization",token(customer))).andExpect(content().json("{}"));mvc.perform(get("/api/orders").header("Authorization",token(other))).andExpect(content().json("[]"));mvc.perform(post("/api/account/checkout").header("Authorization",token(customer))).andExpect(status().isBadRequest());}
 @Test void stockValidationAndRemoval() throws Exception {mvc.perform(put("/api/account/cart/"+product.getId()).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":6}")).andExpect(status().isConflict());mvc.perform(put("/api/account/cart/"+product.getId()).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":1}")).andExpect(status().isOk());mvc.perform(put("/api/account/cart/"+product.getId()).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":0}")).andExpect(content().json("{}"));}
 @Test void sessionsCannotSpoofIdentityOrBeReadByOtherUsers() throws Exception {mvc.perform(post("/api/try-on-sessions").header("Authorization",token(customer)).contentType("application/json").content("{\"userId\":"+other.getId()+",\"productId\":"+product.getId()+",\"tryOnType\":\"NECKLACE\",\"inputImageUrl\":\"urn:tryonbd:capture:photo:640x480\"}")).andExpect(status().isCreated()).andExpect(jsonPath("$.userId").value(customer.getId())).andExpect(jsonPath("$.tryOnType").value("SHIRT"));Long id=sessions.findAll().getFirst().getId();mvc.perform(get("/api/try-on-sessions/"+id).header("Authorization",token(other))).andExpect(status().isForbidden());mvc.perform(get("/api/try-on-sessions").header("Authorization",token(other))).andExpect(content().json("[]"));}
 @Test void sellersCannotManageOtherProductsAndCanCreateFreeProductsWithoutImages() throws Exception {Product foreignProduct=new Product();foreignProduct.setName("Other");foreignProduct.setPrice(BigDecimal.ONE);foreignProduct.setStockQuantity(1);foreignProduct.setCategory(category);foreignProduct.setSeller(otherSeller);products.save(foreignProduct);mvc.perform(delete("/api/products/"+foreignProduct.getId()).header("Authorization",token(sellerUser))).andExpect(status().isForbidden());String body="{\"sellerId\":"+otherSeller.getId()+",\"categoryId\":"+category.getId()+",\"name\":\"New Shirt\",\"price\":0,\"stockQuantity\":0,\"arType\":\"TSHIRT\"}";mvc.perform(post("/api/products").header("Authorization",token(sellerUser)).contentType("application/json").content(body)).andExpect(status().isCreated()).andExpect(jsonPath("$.sellerId").value(seller.getId())).andExpect(jsonPath("$.arType").value("TSHIRT"));}
 @Test void onlySuperAdminCanAssignRoles() throws Exception {String path="/api/users/"+other.getId()+"/role";mvc.perform(put(path).header("Authorization",token(admin)).contentType("application/json").content("{\"role\":\"SELLER\"}")).andExpect(status().isForbidden());mvc.perform(put(path).header("Authorization",token(superAdmin)).contentType("application/json").content("{\"role\":\"SELLER\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("SELLER"));}
 @Test void superAdminCanCreateAdminUsingExistingUserAndRoleApis() throws Exception {
   String body="{\"fullName\":\"Managed Admin\",\"email\":\"managed-admin@test.example\",\"password\":\"secret123\",\"phone\":\"01700000000\",\"address\":\"Dhaka\"}";
   mvc.perform(post("/api/users").header("Authorization",token(superAdmin)).contentType("application/json").content(body))
     .andExpect(status().isCreated()).andExpect(jsonPath("$.role").value("CUSTOMER"));
   User created=users.findByEmail("managed-admin@test.example").orElseThrow();
   assertTrue(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().matches("secret123",created.getPassword()));
   String rolePath="/api/users/"+created.getId()+"/role";
   mvc.perform(put(rolePath).header("Authorization",token(admin)).contentType("application/json").content("{\"role\":\"ADMIN\"}")).andExpect(status().isForbidden());
   mvc.perform(put(rolePath).header("Authorization",token(superAdmin)).contentType("application/json").content("{\"role\":\"ADMIN\"}"))
     .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
 }
 @Test void adminsSeeSystemTryOnSessionsButOtherRolesStayScoped() throws Exception {
   String payload="{\"productId\":"+product.getId()+",\"tryOnType\":\"SHIRT\",\"inputImageUrl\":\"urn:tryonbd:capture:upload:640x480\"}";
   mvc.perform(post("/api/try-on-sessions").header("Authorization",token(customer)).contentType("application/json").content(payload)).andExpect(status().isCreated());
   mvc.perform(post("/api/try-on-sessions").header("Authorization",token(other)).contentType("application/json").content(payload)).andExpect(status().isCreated());
   mvc.perform(get("/api/try-on-sessions").header("Authorization",token(customer))).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
   mvc.perform(get("/api/try-on-sessions").header("Authorization",token(sellerUser))).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
   mvc.perform(get("/api/try-on-sessions").header("Authorization",token(admin))).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
   mvc.perform(get("/api/try-on-sessions").header("Authorization",token(superAdmin))).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2));
 }
 @Test void adminCannotManageSuperAdminAccount() throws Exception {
   String update="{\"fullName\":\"Super Admin\",\"email\":\"super@test.example\",\"phone\":\"01700000000\",\"address\":\"Dhaka\"}";
   mvc.perform(put("/api/users/"+superAdmin.getId()).header("Authorization",token(admin)).contentType("application/json").content(update)).andExpect(status().isForbidden());
   mvc.perform(delete("/api/users/"+superAdmin.getId()).header("Authorization",token(admin))).andExpect(status().isForbidden());
   mvc.perform(put("/api/users/"+superAdmin.getId()+"/role").header("Authorization",token(admin)).contentType("application/json").content("{\"role\":\"ADMIN\"}")).andExpect(status().isForbidden());
 }
 @Test void realLoginRejectsInvalidPasswordAndRestoresUser() throws Exception {
 mvc.perform(post("/api/auth/login").contentType("application/json").content("{\"email\":\"customer@test.example\",\"password\":\"wrong\"}")).andExpect(status().isUnauthorized());
 mvc.perform(post("/api/auth/login").contentType("application/json").content("{\"email\":\"customer@test.example\",\"password\":\"secret123\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").isString()).andExpect(jsonPath("$.user.password").doesNotExist());
 mvc.perform(get("/api/account/me").header("Authorization",token(customer))).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(customer.getId()));
 }
 @Test void snapshotsPersistAndOrdersDenyOtherUsers() throws Exception {
 mvc.perform(put("/api/account/cart/"+product.getId()).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":2}")).andExpect(status().isOk());entityManager.flush();entityManager.clear();
 mvc.perform(get("/api/account/cart").header("Authorization",token(customer))).andExpect(jsonPath("$."+product.getId()).value(2));
 mvc.perform(post("/api/account/checkout").header("Authorization",token(customer))).andExpect(status().isOk());entityManager.flush();entityManager.clear();
 var order=orders.findAll().getFirst();assertEquals(1,order.getItems().size());assertEquals("Test Shirt",order.getItems().getFirst().get("name"));
 mvc.perform(get("/api/orders/"+order.getId()).header("Authorization",token(other))).andExpect(status().isForbidden());
 }
 @Test void checkoutRechecksStockWithoutClearingCartOnFailure() throws Exception {
 mvc.perform(put("/api/account/cart/"+product.getId()).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":5}")).andExpect(status().isOk());
 product.setStockQuantity(1);products.save(product);mvc.perform(post("/api/account/checkout").header("Authorization",token(customer))).andExpect(status().isConflict());assertEquals(0,orders.count());
 mvc.perform(get("/api/account/cart").header("Authorization",token(customer))).andExpect(jsonPath("$."+product.getId()).value(5));
 }
 @Test void publicRegistrationAlwaysCreatesCustomerAndStoresHashedPassword() throws Exception {
 mvc.perform(post("/api/auth/register").contentType("application/json").content("{\"fullName\":\"New Account\",\"email\":\"new@test.example\",\"password\":\"secret123\",\"phone\":\"01700000000\",\"address\":\"Dhaka\",\"role\":\"SUPER_ADMIN\"}")).andExpect(status().isCreated()).andExpect(jsonPath("$.user.role").value("CUSTOMER")).andExpect(jsonPath("$.user.password").doesNotExist()).andExpect(jsonPath("$.accessToken").isString());
 assertTrue(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().matches("secret123",users.findByEmail("new@test.example").orElseThrow().getPassword()));
 }
 @Test void cartAddsAccumulateAndMissingQuantityIsRejected() throws Exception {
 String path="/api/account/cart/"+product.getId();
 mvc.perform(post(path).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":1}")).andExpect(status().isOk());
 mvc.perform(post(path).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":2}")).andExpect(status().isOk()).andExpect(jsonPath("$."+product.getId()).value(3));
 mvc.perform(put(path).header("Authorization",token(customer)).contentType("application/json").content("{}")).andExpect(status().isBadRequest());
 }

 @Test void realNecklaceImportIsIdempotentAndPreservesExistingProducts() {
     var first=necklaceImporter.importFiles(seller.getId(),java.util.List.of("silver-diamond-necklace.png","pearl-necklace.png"));
     assertEquals(2,first.size());
     assertEquals("Silver Diamond Necklace",first.getFirst().name());
     assertEquals(0,first.getFirst().price().signum());
     assertEquals(0,first.getFirst().stockQuantity());
     assertEquals("NECKLACE",first.getFirst().arType());
     assertEquals("Jewelry",first.getFirst().categoryName());
     assertEquals("/assets/jewelry/necklaces/silver-diamond-necklace.png",first.getFirst().imageUrl());
     var second=necklaceImporter.importFiles(seller.getId(),java.util.List.of("silver-diamond-necklace.png","pearl-necklace.png"));
     assertEquals(first.stream().map(p->p.id()).toList(),second.stream().map(p->p.id()).toList());
     assertEquals(3,products.count());
     assertEquals(2,categories.count());
     entityManager.flush();entityManager.clear();
     assertEquals("Test Shirt",products.findById(product.getId()).orElseThrow().getName());
     assertEquals("SHIRT",products.findById(product.getId()).orElseThrow().getArType());
 }

 @Test void importRetainsBusinessValuesAndRejectsConflictingImages() {
     var imported=necklaceImporter.importFiles(seller.getId(),java.util.List.of("necklace.png")).getFirst();
     Product necklace=products.findById(imported.id()).orElseThrow();
     necklace.setPrice(new BigDecimal("850"));necklace.setStockQuantity(7);products.save(necklace);
     var repeated=necklaceImporter.importFiles(seller.getId(),java.util.List.of("necklace.png")).getFirst();
     assertEquals(new BigDecimal("850"),repeated.price());assertEquals(7,repeated.stockQuantity());
     necklace.setArType("EYEWEAR");products.save(necklace);
     assertThrows(IllegalStateException.class,()->necklaceImporter.importFiles(seller.getId(),java.util.List.of("necklace.png")));
     assertThrows(IllegalArgumentException.class,()->necklaceImporter.importFiles(seller.getId(),java.util.List.of("../bad.png")));
 }

 @Test void sellerNecklacesPersistSerializeAndEnforceOwnership() throws Exception {
     var imported=necklaceImporter.importFiles(seller.getId(),java.util.List.of("necklace.png")).getFirst();
     String body="{\"sellerId\":"+otherSeller.getId()+",\"categoryId\":"+imported.categoryId()+",\"name\":\"Seller Necklace\",\"description\":\"Seller supplied details\",\"price\":1250,\"stockQuantity\":3,\"imageUrl\":\"/assets/jewelry/necklaces/necklace-b.png\",\"arType\":\" necklace \"}";
     mvc.perform(post("/api/products").header("Authorization",token(sellerUser)).contentType("application/json").content(body))
       .andExpect(status().isCreated()).andExpect(jsonPath("$.arType").value("NECKLACE"))
       .andExpect(jsonPath("$.sellerId").value(seller.getId())).andExpect(jsonPath("$.categoryId").value(imported.categoryId()));
     entityManager.flush();entityManager.clear();
     Product necklace=products.findAll().stream().filter(p->"Seller Necklace".equals(p.getName())).findFirst().orElseThrow();
     Long id=necklace.getId();
     mvc.perform(get("/api/products/"+id)).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Seller Necklace"))
       .andExpect(jsonPath("$.price").value(1250)).andExpect(jsonPath("$.stockQuantity").value(3))
       .andExpect(jsonPath("$.description").value("Seller supplied details"))
       .andExpect(jsonPath("$.imageUrl").value("/assets/jewelry/necklaces/necklace-b.png"));
     mvc.perform(get("/api/account/products").header("Authorization",token(sellerUser))).andExpect(status().isOk());
     mvc.perform(put("/api/products/"+id).header("Authorization",token(other)).contentType("application/json").content(body)).andExpect(status().isForbidden());
     other.setRole("SELLER");users.save(other);
     mvc.perform(put("/api/products/"+id).header("Authorization",token(other)).contentType("application/json").content(body)).andExpect(status().isForbidden());
     String updated=body.replace("Seller Necklace","Updated Necklace").replace("1250","1300").replace("necklace-b.png","necklace-c.png");
     mvc.perform(put("/api/products/"+id).header("Authorization",token(sellerUser)).contentType("application/json").content(updated))
       .andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Updated Necklace")).andExpect(jsonPath("$.price").value(1300));
     mvc.perform(put("/api/products/"+id).header("Authorization",token(admin)).contentType("application/json").content(updated)).andExpect(status().isOk());
     mvc.perform(put("/api/products/"+id).header("Authorization",token(superAdmin)).contentType("application/json").content(updated)).andExpect(status().isOk());
 }

 @Test void necklaceCartOrderAndSessionReferenceRealProductAndUser() throws Exception {
     var imported=necklaceImporter.importFiles(seller.getId(),java.util.List.of("necklace.png")).getFirst();
     Product necklace=products.findById(imported.id()).orElseThrow();necklace.setPrice(new BigDecimal("900"));necklace.setStockQuantity(4);products.save(necklace);
     String cartPath="/api/account/cart/"+necklace.getId();
     mvc.perform(post(cartPath).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":1}")).andExpect(status().isOk());
     mvc.perform(put(cartPath).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":2}")).andExpect(status().isOk());
     entityManager.flush();entityManager.clear();
     mvc.perform(get("/api/account/cart").header("Authorization",token(customer))).andExpect(jsonPath("$."+necklace.getId()).value(2));
     mvc.perform(post("/api/try-on-sessions").header("Authorization",token(customer)).contentType("application/json")
       .content("{\"productId\":"+necklace.getId()+",\"userId\":"+other.getId()+",\"tryOnType\":\"SHIRT\",\"inputImageUrl\":\"urn:tryonbd:capture:upload:640x480\"}"))
       .andExpect(status().isCreated()).andExpect(jsonPath("$.productId").value(necklace.getId()))
       .andExpect(jsonPath("$.userId").value(customer.getId())).andExpect(jsonPath("$.tryOnType").value("NECKLACE"));
     mvc.perform(post("/api/account/checkout").header("Authorization",token(customer)))
       .andExpect(status().isOk()).andExpect(jsonPath("$.totalAmount").value(1800))
       .andExpect(jsonPath("$.items[0].productId").value(necklace.getId())).andExpect(jsonPath("$.items[0].quantity").value(2));
     entityManager.flush();entityManager.clear();
     assertEquals(2,products.findById(necklace.getId()).orElseThrow().getStockQuantity());
     mvc.perform(get("/api/account/cart").header("Authorization",token(customer))).andExpect(content().json("{}"));
     mvc.perform(get("/api/try-on-sessions").header("Authorization",token(customer))).andExpect(jsonPath("$[0].tryOnType").value("NECKLACE"));
     mvc.perform(put(cartPath).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":1}")).andExpect(status().isOk());
     mvc.perform(put(cartPath).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":0}")).andExpect(content().json("{}"));
 }

 @Test void sellerCatalogIncludesAllLegacyProfilesOwnedByJwtUser() throws Exception {
     Seller second=seller(sellerUser);
     var imported=necklaceImporter.importFiles(second.getId(),java.util.List.of("owned-necklace.png")).getFirst();
     mvc.perform(get("/api/account/products").header("Authorization",token(sellerUser)))
       .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(2))
       .andExpect(jsonPath("$[?(@.id == "+imported.id()+")].sellerId").value(org.hamcrest.Matchers.contains(second.getId().intValue())));
     other.setRole("SELLER");users.save(other);
     mvc.perform(get("/api/account/products").header("Authorization",token(other))).andExpect(content().json("[]"));
 }

 @Autowired com.tryonbd.backend.service.ProductAssetSyncService assetSync;
 @org.junit.jupiter.api.io.TempDir java.nio.file.Path packageRoot;
 @Test void importedProductMetadataSurvivesSellerAdminEditsAndUsesGenericCartCheckout() throws Exception {
     java.nio.file.Path folder=packageRoot.resolve("jewelry/approved-choker");java.nio.file.Files.createDirectories(folder);
     java.awt.image.BufferedImage image=new java.awt.image.BufferedImage(4,4,java.awt.image.BufferedImage.TYPE_INT_ARGB);image.setRGB(1,1,0xff887744);javax.imageio.ImageIO.write(image,"png",folder.resolve("front.png").toFile());
     java.nio.file.Files.writeString(folder.resolve("product.json"),"{\"name\":\"Imported Choker\",\"description\":\"Seller supplied details\",\"price\":2899,\"stockQuantity\":12,\"category\":\"Jewelry\",\"arType\":\"NECKLACE\",\"style\":\"CHOKER\",\"sellerId\":"+seller.getId()+"}");
     var result=assetSync.sync(com.tryonbd.backend.service.ProductAssetPackage.discover(packageRoot),null,false).getFirst();
     Long id=result.productId();Product imported=products.findById(id).orElseThrow();entityManager.flush();entityManager.clear();
     mvc.perform(get("/api/products/"+id)).andExpect(status().isOk()).andExpect(jsonPath("$.arMetadata.style").value("CHOKER"))
       .andExpect(jsonPath("$.imageUrl").value("/assets/products/jewelry/approved-choker/front.png"));
     mvc.perform(get("/api/account/products").header("Authorization",token(sellerUser))).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.id == "+id+")].name").value("Imported Choker"));
     String edit="{\"name\":\"Imported Choker\",\"description\":\"Seller supplied details\",\"price\":2899,\"stockQuantity\":12,\"categoryId\":"+imported.getCategory().getId()+",\"imageUrl\":\"/assets/products/jewelry/approved-choker/front.png\",\"arType\":\"NECKLACE\"}";
     for(User manager:java.util.List.of(sellerUser,admin,superAdmin))
       mvc.perform(put("/api/products/"+id).header("Authorization",token(manager)).contentType("application/json").content(edit))
         .andExpect(status().isOk()).andExpect(jsonPath("$.arMetadata.style").value("CHOKER"));
     mvc.perform(put("/api/products/"+id).header("Authorization",token(other)).contentType("application/json").content(edit)).andExpect(status().isForbidden());
     mvc.perform(put("/api/account/cart/"+id).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":13}")).andExpect(status().isConflict());
     mvc.perform(put("/api/account/cart/"+id).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":2}")).andExpect(status().isOk());
     mvc.perform(post("/api/account/checkout").header("Authorization",token(customer))).andExpect(status().isOk())
       .andExpect(jsonPath("$.totalAmount").value(5798)).andExpect(jsonPath("$.items[0].productId").value(id));
     assertEquals(10,products.findById(id).orElseThrow().getStockQuantity());
 }
 @Test void productApiAcceptsValidatedMetadataAndRejectsUnknownStyleOrUnboundedFit() throws Exception {
     String base="{\"sellerId\":"+seller.getId()+",\"categoryId\":"+category.getId()+",\"name\":\"Product\",\"price\":1,\"stockQuantity\":1,\"arType\":\"NECKLACE\",\"imageUrl\":\"/assets/real.png\",\"arMetadata\":{\"frontAsset\":\"/assets/real.png\",\"style\":\"CHOKER\",\"fitProfile\":{\"widthRatio\":0.8}}}";
     mvc.perform(post("/api/products").header("Authorization",token(sellerUser)).contentType("application/json").content(base)).andExpect(status().isCreated()).andExpect(jsonPath("$.arMetadata.style").value("CHOKER"));
     for(String invalid:java.util.List.of(base.replace("CHOKER","UNKNOWN"),base.replace("0.8","50"),base.replace("frontAsset","unknownAsset")))
       mvc.perform(post("/api/products").header("Authorization",token(sellerUser)).contentType("application/json").content(invalid)).andExpect(status().isBadRequest());
 }

 @Test void packageImagesArePublicAndCannotExposeManifestOrEscapeDirectory() throws Exception {
     mvc.perform(get("/assets/products/jewelry/royal-gold-choker/front.png").header("Origin","http://127.0.0.1:5175"))
       .andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","*"));
     mvc.perform(get("/api/account/me").header("Origin","https://untrusted.example")).andExpect(status().isForbidden());
     mvc.perform(get("/assets/products/jewelry/royal-gold-choker/front.png")).andExpect(status().isOk())
       .andExpect(content().contentType("image/png")).andExpect(header().string("Cache-Control","no-cache"));
     mvc.perform(get("/assets/products/jewelry/royal-gold-choker/product.json")).andExpect(status().isNotFound());
     mvc.perform(get("/assets/products/eyewear/modern-clear-frame/modern-clear-side.webp")).andExpect(status().isOk())
       .andExpect(content().contentType("image/webp"));
     mvc.perform(get("/assets/products/eyewear/modern-clear-frame/missing.webp")).andExpect(status().isNotFound());
     mvc.perform(get("/assets/products/jewelry/royal-gold-choker/missing.png")).andExpect(status().isNotFound());
     mvc.perform(get("/assets/products/unknown/royal-gold-choker/front.png")).andExpect(status().isNotFound());
     mvc.perform(get("/assets/products/jewelry/../front.png")).andExpect(status().is4xxClientError());
     mvc.perform(post("/assets/products/jewelry/royal-gold-choker/front.png").header("Authorization",token(sellerUser))).andExpect(status().isForbidden());
 }
}
