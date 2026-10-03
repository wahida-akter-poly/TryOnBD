package com.tryonbd.backend.response;
import com.tryonbd.backend.model.Category;
import java.math.BigDecimal;
import java.time.LocalDateTime;
public record CategoryResponse(Long id, String categoryName, String description, Long parentCategoryId, LocalDateTime createdAt) {
    public static CategoryResponse from(Category value) {
        return new CategoryResponse(value.getId(), value.getCategoryName(), value.getDescription(), value.getParentCategory() == null ? null : value.getParentCategory().getId(), value.getCreatedAt());
    }
}
