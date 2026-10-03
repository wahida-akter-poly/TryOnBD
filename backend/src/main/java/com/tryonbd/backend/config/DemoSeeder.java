package com.tryonbd.backend.config;
import com.tryonbd.backend.model.*;
import com.tryonbd.backend.repository.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import java.math.BigDecimal;
@Component
@ConditionalOnProperty(name = "app.demo.seed", havingValue = "true")
public class DemoSeeder implements CommandLineRunner {
    private final UserRepository users;
    private final SellerRepository sellers;
    private final CategoryRepository categories;
    private final ProductRepository products;
    public DemoSeeder(UserRepository users, SellerRepository sellers, CategoryRepository categories, ProductRepository products) {
        this.users = users; this.sellers = sellers; this.categories = categories; this.products = products;
    }
    @Override @Transactional
    public void run(String... args) {
        if (users.count() == 0) {
            User user = new User();
            user.setFullName("Demo User"); user.setEmail("demo@tryonbd.example");
            user.setPassword(new BCryptPasswordEncoder().encode("DemoPass123"));
            user.setPhone("01700000000"); user.setAddress("Dhaka"); user.setRole("CUSTOMER");
            users.save(user);
        }
        if (categories.count() == 0) {
            Category eyewear = new Category(); eyewear.setCategoryName("Eyewear"); eyewear.setDescription("AR eyewear");
            categories.save(eyewear);
            Category clothing = new Category(); clothing.setCategoryName("Clothing"); clothing.setDescription("AR clothing");
            categories.save(clothing);
        }
        if (sellers.count() == 0) {
            Seller seller = new Seller(); seller.setUser(users.findAll().getFirst());
            seller.setBusinessName("TryOnBD Demo Shop"); seller.setContactEmail("shop@tryonbd.example");
            seller.setPhone("01800000000"); seller.setSubscriptionStatus("active"); sellers.save(seller);
        }
        if (products.count() == 0) {
            var allCategories = categories.findAll();
            Category eyewear = allCategories.stream().filter(c -> c.getCategoryName().equals("Eyewear")).findFirst().orElse(allCategories.getFirst());
            Category clothing = allCategories.stream().filter(c -> c.getCategoryName().equals("Clothing")).findFirst().orElse(allCategories.getFirst());
            seedProduct("Black T-Shirt", "SHIRT", "690.00", "/assets/body-ar/shirts/tshirt-black-front.png", clothing);
            seedProduct("Modern Clear Frame", "EYEWEAR", "1490.00", "/assets/face-ar/sunglasses/modern-clear-front-clean.png", eyewear);
            seedProduct("Classic Aviator", "EYEWEAR", "1290.00", "/assets/face-ar/sunglasses/aviator-real.png", eyewear);
        }
    }
    private void seedProduct(String name, String arType, String price, String imageUrl, Category category) {
        Product product = new Product(); product.setName(name); product.setDescription("Local PostgreSQL demo product");
        product.setPrice(new BigDecimal(price)); product.setStockQuantity(20);
        product.setImageUrl(imageUrl); product.setArType(arType);
        product.setCategory(category); product.setSeller(sellers.findAll().getFirst()); products.save(product);
    }
}
