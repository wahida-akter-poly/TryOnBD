package com.tryonbd.backend.response;
import com.tryonbd.backend.model.TryOnSession;
import java.math.BigDecimal;
import java.time.LocalDateTime;
public record TryOnSessionResponse(Long id, Long userId, Long productId, String tryOnType, String inputImageUrl, String resultImageUrl, LocalDateTime createdAt) {
    public static TryOnSessionResponse from(TryOnSession value) {
        return new TryOnSessionResponse(value.getId(), value.getUser().getId(), value.getProduct().getId(), value.getTryOnType(), value.getInputImageUrl(), value.getResultImageUrl(), value.getCreatedAt());
    }
}
