package com.tryonbd.backend.service;

import com.tryonbd.backend.model.Seller;
import com.tryonbd.backend.model.User;
import com.tryonbd.backend.repository.SellerRepository;
import com.tryonbd.backend.repository.UserRepository;
import java.util.Objects;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
@Profile("demo-seed")
public class DemoAccountSeeder implements ApplicationRunner {
    private static final String CUSTOMER_EMAIL = "customer@tryonbd.demo";
    private static final String CUSTOMER_PASSWORD = "Customer@123";
    private static final String SELLER_EMAIL = "anzara@tryonbd.demo";
    private static final String SELLER_PASSWORD = "Anzara@123";
    private static final long ANZARA_SELLER_ID = 2L;

    private final UserRepository users;
    private final SellerRepository sellers;
    private final BCryptPasswordEncoder passwords;

    public DemoAccountSeeder(
        UserRepository users,
        SellerRepository sellers,
        BCryptPasswordEncoder passwords
    ) {
        this.users = users;
        this.sellers = sellers;
        this.passwords = passwords;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        Seller anzara = sellers.findById(ANZARA_SELLER_ID)
            .orElseThrow(() -> new IllegalStateException("Existing Anzara seller ID 2 was not found"));
        if (!"Anzara".equals(anzara.getBusinessName())) {
            throw new IllegalStateException("Seller ID 2 is not Anzara; demo seed was not applied");
        }

        User customer = upsert(CUSTOMER_EMAIL, CUSTOMER_PASSWORD, "TryOnBD Customer", "CUSTOMER");
        if (sellers.existsByUserId(customer.getId())) {
            throw new IllegalStateException("Demo customer is already linked to a seller profile");
        }

        User sellerUser = upsert(SELLER_EMAIL, SELLER_PASSWORD, "Anzara", "SELLER");
        boolean hasOtherSeller = sellers.findAllByUserId(sellerUser.getId()).stream()
            .anyMatch(seller -> !Objects.equals(seller.getId(), ANZARA_SELLER_ID));
        if (hasOtherSeller) {
            throw new IllegalStateException("Demo seller is already linked to another seller profile");
        }

        anzara.setUser(sellerUser);
        sellers.save(anzara);
        System.out.printf(
            "Demo accounts ready: customer user %d; seller user %d linked to existing seller %d%n",
            customer.getId(),
            sellerUser.getId(),
            anzara.getId()
        );
    }

    private User upsert(String email, String rawPassword, String fullName, String role) {
        User user = users.findByEmail(email).orElseGet(User::new);
        user.setEmail(email);
        user.setFullName(fullName);
        user.setRole(role);
        if (user.getPassword() == null || !passwords.matches(rawPassword, user.getPassword())) {
            user.setPassword(passwords.encode(rawPassword));
        }
        return users.save(user);
    }
}
