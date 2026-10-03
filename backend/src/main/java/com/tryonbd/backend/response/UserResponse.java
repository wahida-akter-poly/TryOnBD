package com.tryonbd.backend.response;
import com.tryonbd.backend.model.User;
import java.math.BigDecimal;
import java.time.LocalDateTime;
public record UserResponse(Long id, String name, String fullName, String email, String phone, String address, String role, LocalDateTime createdAt) {
    public static UserResponse from(User value) {
        return new UserResponse(value.getId(), value.getFullName(), value.getFullName(), value.getEmail(), value.getPhone(), value.getAddress(), value.getRole(), value.getCreatedAt());
    }
}
