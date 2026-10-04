package com.tryonbd.backend.service;

import com.tryonbd.backend.model.*;
import com.tryonbd.backend.repository.*;
import com.tryonbd.backend.request.CreateCategoryRequest;
import com.tryonbd.backend.response.ProductResponse;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Explicit database-owner import; never runs during normal application startup. */
@Service
public class NecklaceCatalogImportService {
    private final CategoryRepository categories;
    private final ProductRepository products;
    private final SellerRepository sellers;
    private final PersistenceService persistence;
    private final EntityManager entityManager;

    public NecklaceCatalogImportService(CategoryRepository categories, ProductRepository products,
            SellerRepository sellers, PersistenceService persistence, EntityManager entityManager) {
        this.categories = categories;
        this.products = products;
        this.sellers = sellers;
        this.persistence = persistence;
        this.entityManager = entityManager;
    }

    @Transactional
    public List<ProductResponse> importFiles(Long sellerId, List<String> filenames) {
        if (filenames.isEmpty()) throw new IllegalArgumentException("No real necklace PNG files found");
        for (String filename : filenames) {
            if (filename == null || filename.contains("/") || filename.contains("\\")
                    || !filename.toLowerCase(Locale.ROOT).endsWith(".png")) {
                throw new IllegalArgumentException("Expected a local PNG filename");
            }
        }
        Seller seller = sellers.findById(sellerId)
                .orElseThrow(() -> new IllegalArgumentException("Choose an existing seller ID"));
        // Serialize explicit imports without altering existing product identities.
        entityManager.lock(seller, LockModeType.PESSIMISTIC_WRITE);
        List<Category> jewelry = categories.findAll().stream()
                .filter(c -> "Jewelry".equalsIgnoreCase(c.getCategoryName().trim())).toList();
        if (jewelry.size() > 1) throw new IllegalStateException("Multiple Jewelry categories need review");
        Category category;
        if (jewelry.isEmpty()) {
            CreateCategoryRequest request = new CreateCategoryRequest();
            request.setCategoryName("Jewelry");
            request.setDescription("Jewelry products");
            Long id = persistence.createCategory(request).id();
            category = categories.findById(id).orElseThrow();
        } else category = jewelry.getFirst();
        List<ProductResponse> imported = new ArrayList<>();
        for (String filename : new LinkedHashSet<>(filenames)) {
            String imageUrl = "/assets/jewelry/necklaces/"
                    + URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
            List<Product> existing = products.findAll().stream()
                    .filter(p -> imageUrl.equals(p.getImageUrl())).toList();
            if (existing.size() > 1) throw new IllegalStateException("Duplicate product image: " + imageUrl);
            Product product;
            if (!existing.isEmpty()) {
                product = existing.getFirst();
                if (!"NECKLACE".equals(product.getArType()) || !category.getId().equals(product.getCategory().getId()))
                    throw new IllegalStateException("Existing image belongs to different product metadata: " + imageUrl);
            } else {
                product = new Product();
                String base = filename.substring(0, filename.length() - 4).replaceAll("[-_]+", " ").trim();
                String name = Arrays.stream(base.split("\\s+"))
                        .map(word -> word.isEmpty() ? word : word.substring(0, 1).toUpperCase(Locale.ROOT) + word.substring(1))
                        .collect(java.util.stream.Collectors.joining(" "));
                product.setName(name);
                product.setDescription("Product details and pricing pending seller review.");
                product.setPrice(BigDecimal.ZERO);
                product.setStockQuantity(0);
                product.setImageUrl(imageUrl);
                product.setArType("NECKLACE");
                product.setCategory(category);
                product.setSeller(seller);
                products.save(product);
            }
            imported.add(ProductResponse.from(product));
        }
        return imported;
    }
}
