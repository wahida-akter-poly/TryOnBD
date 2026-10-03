package com.tryonbd.backend.response;
import com.tryonbd.backend.model.Seller;
import java.math.BigDecimal;
import java.time.LocalDateTime;
public record SellerResponse(Long id, Long userId, String businessName, String contactEmail, String phone, String subscriptionStatus, LocalDateTime createdAt) {
    public static SellerResponse from(Seller value) {
        return new SellerResponse(value.getId(), value.getUser().getId(), value.getBusinessName(), value.getContactEmail(), value.getPhone(), value.getSubscriptionStatus(), value.getCreatedAt());
    }
}
