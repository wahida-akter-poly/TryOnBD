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
 MockMvc mvc; User customer,other,sellerUser,admin,superAdmin; Seller seller,otherSeller; Product product; Category category;
 User user(String role,String email){User u=new User();u.setFullName(role);u.setEmail(email);u.setPassword(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().encode("secret123"));u.setRole(role);u.setPhone("01700000000");u.setAddress("Dhaka");return users.save(u);}
 Seller seller(User u){Seller s=new Seller();s.setUser(u);s.setBusinessName("Test Store");s.setContactEmail(u.getEmail());s.setPhone("01700000000");s.setSubscriptionStatus("ACTIVE");return sellers.save(s);}
 String token(User u){return "Bearer "+jwt.generateToken(u.getId(),u.getEmail(),u.getRole());}
 @BeforeEach void setup(){mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();customer=user("CUSTOMER","customer@test.example");other=user("CUSTOMER","other@test.example");sellerUser=user("SELLER","seller@test.example");admin=user("ADMIN","admin@test.example");superAdmin=user("SUPER_ADMIN","super@test.example");seller=seller(sellerUser);otherSeller=seller(other);category=new Category();category.setCategoryName("Clothing");category.setDescription("Test category");categories.save(category);product=new Product();product.setName("Test Shirt");product.setArType("SHIRT");product.setPrice(new BigDecimal("12.50"));product.setStockQuantity(5);product.setCategory(category);product.setSeller(seller);products.save(product);}
 @Test void catalogIsPublicAndMissingProductIs404() throws Exception {mvc.perform(get("/api/products")).andExpect(status().isOk()).andExpect(jsonPath("$[0].name").value("Test Shirt"));mvc.perform(get("/api/categories")).andExpect(status().isOk());mvc.perform(get("/api/products/999999")).andExpect(status().isNotFound());}
 @Test void protectedEndpointsRequireJwtAndCustomerCannotManage() throws Exception {mvc.perform(get("/api/account/cart")).andExpect(status().isUnauthorized());mvc.perform(get("/api/account/me").header("Authorization","Bearer invalid")).andExpect(status().isUnauthorized());mvc.perform(get("/api/users").header("Authorization",token(customer))).andExpect(status().isForbidden());mvc.perform(delete("/api/products/"+product.getId()).header("Authorization",token(customer))).andExpect(status().isForbidden());mvc.perform(get("/api/users").header("Authorization",token(admin))).andExpect(status().isOk());}
 @Test void cartAndCheckoutUsePrincipalAndServerPrices() throws Exception {mvc.perform(put("/api/account/cart/"+product.getId()).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":2}")).andExpect(status().isOk());mvc.perform(get("/api/account/cart").header("Authorization",token(other))).andExpect(content().json("{}"));mvc.perform(post("/api/account/checkout").header("Authorization",token(customer))).andExpect(status().isOk()).andExpect(jsonPath("$.totalAmount").value(25)).andExpect(jsonPath("$.userId").value(customer.getId())).andExpect(jsonPath("$.items[0].quantity").value(2));assertEquals(3,products.findById(product.getId()).orElseThrow().getStockQuantity());mvc.perform(get("/api/account/cart").header("Authorization",token(customer))).andExpect(content().json("{}"));mvc.perform(get("/api/orders").header("Authorization",token(other))).andExpect(content().json("[]"));mvc.perform(post("/api/account/checkout").header("Authorization",token(customer))).andExpect(status().isBadRequest());}
 @Test void stockValidationAndRemoval() throws Exception {mvc.perform(put("/api/account/cart/"+product.getId()).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":6}")).andExpect(status().isConflict());mvc.perform(put("/api/account/cart/"+product.getId()).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":1}")).andExpect(status().isOk());mvc.perform(put("/api/account/cart/"+product.getId()).header("Authorization",token(customer)).contentType("application/json").content("{\"quantity\":0}")).andExpect(content().json("{}"));}
 @Test void sessionsCannotSpoofIdentityOrBeReadByOtherUsers() throws Exception {mvc.perform(post("/api/try-on-sessions").header("Authorization",token(customer)).contentType("application/json").content("{\"userId\":"+other.getId()+",\"productId\":"+product.getId()+",\"tryOnType\":\"NECKLACE\",\"inputImageUrl\":\"urn:tryonbd:capture:photo:640x480\"}")).andExpect(status().isCreated()).andExpect(jsonPath("$.userId").value(customer.getId())).andExpect(jsonPath("$.tryOnType").value("SHIRT"));Long id=sessions.findAll().getFirst().getId();mvc.perform(get("/api/try-on-sessions/"+id).header("Authorization",token(other))).andExpect(status().isForbidden());mvc.perform(get("/api/try-on-sessions").header("Authorization",token(other))).andExpect(content().json("[]"));}
 @Test void sellersCannotManageOtherProductsAndCanCreateFreeProductsWithoutImages() throws Exception {Product foreignProduct=new Product();foreignProduct.setName("Other");foreignProduct.setPrice(BigDecimal.ONE);foreignProduct.setStockQuantity(1);foreignProduct.setCategory(category);foreignProduct.setSeller(otherSeller);products.save(foreignProduct);mvc.perform(delete("/api/products/"+foreignProduct.getId()).header("Authorization",token(sellerUser))).andExpect(status().isForbidden());String body="{\"sellerId\":"+otherSeller.getId()+",\"categoryId\":"+category.getId()+",\"name\":\"New Shirt\",\"price\":0,\"stockQuantity\":0,\"arType\":\"TSHIRT\"}";mvc.perform(post("/api/products").header("Authorization",token(sellerUser)).contentType("application/json").content(body)).andExpect(status().isCreated()).andExpect(jsonPath("$.sellerId").value(seller.getId())).andExpect(jsonPath("$.arType").value("TSHIRT"));}
 @Test void onlySuperAdminCanAssignRoles() throws Exception {String path="/api/users/"+other.getId()+"/role";mvc.perform(put(path).header("Authorization",token(admin)).contentType("application/json").content("{\"role\":\"SELLER\"}")).andExpect(status().isForbidden());mvc.perform(put(path).header("Authorization",token(superAdmin)).contentType("application/json").content("{\"role\":\"SELLER\"}")).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("SELLER"));}
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
}
