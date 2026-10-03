package com.tryonbd.backend.response;
import com.tryonbd.backend.model.Cart;
import java.math.BigDecimal;
import java.time.LocalDateTime;
public record CartResponse(Long id, Long userId, LocalDateTime updatedAt, LocalDateTime createdAt) {
    public static CartResponse from(Cart value) {
        return new CartResponse(value.getId(), value.getUser().getId(), value.getUpdatedAt(), value.getCreatedAt());
    }
}
