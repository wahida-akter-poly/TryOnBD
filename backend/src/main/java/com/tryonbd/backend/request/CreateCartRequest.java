package com.tryonbd.backend.request;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
public class CreateCartRequest {
    @NotNull @Positive private Long userId;
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
}
