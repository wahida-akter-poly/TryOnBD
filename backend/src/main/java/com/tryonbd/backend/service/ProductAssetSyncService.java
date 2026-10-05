package com.tryonbd.backend.service;

import com.tryonbd.backend.model.*;
import com.tryonbd.backend.repository.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProductAssetSyncService {
    private final ProductRepository products;
    private final CategoryRepository categories;
    private final SellerRepository sellers;
    private final EntityManager entities;
    public ProductAssetSyncService(ProductRepository products, CategoryRepository categories,
            SellerRepository sellers, EntityManager entities) {
        this.products = products; this.categories = categories; this.sellers = sellers; this.entities = entities;
    }
    public record Result(String key, String action, Long productId, String detail) {}

    /** Entire batch rolls back on any conflict. Drafts never create business rows. */
    @Transactional
    public List<Result> sync(List<ProductAssetPackage> packages, Long defaultSellerId, boolean dryRun) {
        List<Result> results = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (var pkg : packages) if (!seen.add(pkg.key())) throw new IllegalArgumentException("Duplicate package key: " + pkg.key());
        // Lock the existing category registry in stable order, then sellers. Concurrent
        // imports cannot create case variants of the same category or race product keys.
        List<Category> registry = categories.findAll().stream().sorted(Comparator.comparing(Category::getId)).toList();
        if (!dryRun) for (var category : registry) entities.lock(category, LockModeType.PESSIMISTIC_WRITE);
        Map<Long, Seller> owners = new TreeMap<>();
        for (var pkg : packages) {
            if (pkg.draft()) continue;
            Long id = pkg.sellerId() == null ? defaultSellerId : pkg.sellerId();
            if (id == null) throw new IllegalArgumentException(pkg.key() + ": set sellerId or PRODUCT_SYNC_SELLER_ID to an existing seller");
            Seller seller = sellers.findById(id).orElseThrow(() -> new IllegalArgumentException("Existing seller not found: " + id));
            if (seller.getUser() == null || seller.getUser().getId() == null) throw new IllegalArgumentException("Seller has no legitimate owner: " + id);
            owners.put(id, seller);
        }
        // Lock all sellers (not just this batch) to serialize category creation even
        // when the category table is empty and two importers select different sellers.
        if (!dryRun) for (var seller : sellers.findAll().stream().sorted(Comparator.comparing(Seller::getId)).toList())
            entities.lock(seller, LockModeType.PESSIMISTIC_WRITE);
        for (var pkg : packages) {
            if (pkg.draft()) { results.add(new Result(pkg.key(), "SKIPPED", null, "Draft: supply approved business metadata and set draft=false")); continue; }
            Seller owner = owners.get(pkg.sellerId() == null ? defaultSellerId : pkg.sellerId());
            Product product = products.findByAssetKey(pkg.key()).orElse(null);
            if (pkg.existingProductId() != null) {
                Product explicit = products.findById(pkg.existingProductId()).orElseThrow(() -> new IllegalArgumentException("Explicit existingProductId not found: " + pkg.existingProductId()));
                if (product != null && !product.getId().equals(explicit.getId())) throw new IllegalArgumentException("Package identity conflicts with existingProductId");
                if (explicit.getAssetKey() != null && !explicit.getAssetKey().equals(pkg.key())) throw new IllegalArgumentException("Existing product belongs to another package");
                if (explicit.getAssetKey() == null && (!explicit.getName().equals(pkg.name()) || !explicit.getArType().equals(pkg.arType())))
                    throw new IllegalArgumentException("Explicit legacy adoption requires matching product name and arType");
                product = explicit;
            }
            if (product != null && !dryRun) entities.refresh(product, LockModeType.PESSIMISTIC_WRITE);
            if (product != null && !product.getSeller().getId().equals(owner.getId())) throw new IllegalArgumentException("Cannot change managed seller ownership: " + pkg.key());
            final Long currentId = product == null ? null : product.getId();
            if (products.findAll().stream().anyMatch(p -> pkg.imageUrl().equals(p.getImageUrl()) && !p.getId().equals(currentId)))
                throw new IllegalArgumentException("Image already belongs to an unrelated product: " + pkg.imageUrl());
            List<Category> matches = categories.findAll().stream().filter(c -> pkg.category().equalsIgnoreCase(c.getCategoryName().trim())).toList();
            if (matches.size() > 1) throw new IllegalArgumentException("Ambiguous category: " + pkg.category());
            Category category = matches.isEmpty() ? null : matches.getFirst();
            Map<String, Object> incoming = snapshot(pkg);
            Map<String, Object> previous = product == null ? null : product.getAssetManifest();
            String action = product == null ? "CREATED" : Objects.equals(previous, incoming) ? "UNCHANGED" : "UPDATED";
            String capability = pkg.arType().equals("EYEWEAR") && !(pkg.arMetadata().containsKey("leftTempleAsset") && pkg.arMetadata().containsKey("rightTempleAsset"))
                ? "Catalog only: genuine temple pair missing" : "AR available";
            if (dryRun) { results.add(new Result(pkg.key(), action.equals("UNCHANGED") ? "UNCHANGED" : action.equals("CREATED") ? "WOULD_CREATE" : "WOULD_UPDATE", currentId, capability + (category == null ? "; would create category " + pkg.category() : ""))); continue; }
            if (!action.equals("UNCHANGED") && changed(previous, incoming, "category") && category == null) { category = new Category(); category.setCategoryName(pkg.category()); category.setDescription(""); categories.saveAndFlush(category); }
            if (!action.equals("UNCHANGED")) {
                if (product == null) product = new Product();
                product.setAssetKey(pkg.key());
                if (changed(previous, incoming, "name")) product.setName(pkg.name());
                if (changed(previous, incoming, "description")) product.setDescription(pkg.description());
                if (changed(previous, incoming, "price")) product.setPrice(pkg.price());
                if (changed(previous, incoming, "stockQuantity")) product.setStockQuantity(pkg.stockQuantity());
                if (changed(previous, incoming, "imageUrl")) product.setImageUrl(pkg.imageUrl());
                if (changed(previous, incoming, "arType")) product.setArType(pkg.arType());
                if (changed(previous, incoming, "arMetadata")) product.setArMetadata(pkg.arMetadata());
                if (changed(previous, incoming, "category")) product.setCategory(category);
                product.setSeller(owner); product.setAssetManifest(incoming); products.saveAndFlush(product);
            }
            results.add(new Result(pkg.key(), action, product.getId(), capability));
        }
        return List.copyOf(results);
    }
    private boolean changed(Map<String, Object> previous, Map<String, Object> incoming, String field) {
        return previous == null || !Objects.equals(previous.get(field), incoming.get(field));
    }
    private Map<String, Object> snapshot(ProductAssetPackage pkg) {
        return Map.of("name", pkg.name(), "description", pkg.description(), "price", pkg.price().stripTrailingZeros().toPlainString(),
            "stockQuantity", pkg.stockQuantity(), "category", pkg.category().toLowerCase(Locale.ROOT),
            "arType", pkg.arType(), "imageUrl", pkg.imageUrl(), "arMetadata", pkg.arMetadata());
    }
}
