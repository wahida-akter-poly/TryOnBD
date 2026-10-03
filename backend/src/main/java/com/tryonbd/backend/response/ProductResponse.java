package com.tryonbd.backend.response;
import com.tryonbd.backend.model.Product;
import java.math.BigDecimal;
import java.time.LocalDateTime;
public record ProductResponse(Long id, String name, String description, BigDecimal price, String imageUrl, String arType, Integer stockQuantity, Long categoryId, Long sellerId, LocalDateTime createdAt) {
    public static ProductResponse from(Product value) {
        return new ProductResponse(value.getId(), value.getName(), value.getDescription(), value.getPrice(), value.getImageUrl(), value.getArType(), value.getStockQuantity(), value.getCategory().getId(), value.getSeller().getId(), value.getCreatedAt());
    }
}
