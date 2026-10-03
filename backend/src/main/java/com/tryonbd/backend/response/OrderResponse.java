package com.tryonbd.backend.response;
import com.tryonbd.backend.model.Order;
import java.math.BigDecimal;
import java.time.LocalDateTime;
public record OrderResponse(Long id, Long userId, BigDecimal totalAmount, String orderStatus, LocalDateTime createdAt) {
    public static OrderResponse from(Order value) {
        return new OrderResponse(value.getId(), value.getUser().getId(), value.getTotalAmount(), value.getOrderStatus(), value.getCreatedAt());
    }
}
