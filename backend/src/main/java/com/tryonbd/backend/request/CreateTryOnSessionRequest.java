package com.tryonbd.backend.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public class CreateTryOnSessionRequest {

    @NotNull
    private Integer userId;

    @NotNull
    private Integer productId;

    @NotBlank
    private String inputImageUrl;

    @NotBlank
    private String tryOnType;

    public Integer getUserId() {
        return userId;
    }

    public void setUserId(Integer userId) {
        this.userId = userId;
    }

    public Integer getProductId() {
        return productId;
    }

    public void setProductId(Integer productId) {
        this.productId = productId;
    }

    public String getInputImageUrl() {
        return inputImageUrl;
    }

    public void setInputImageUrl(String inputImageUrl) {
        this.inputImageUrl = inputImageUrl;
    }

    public String getTryOnType() {
        return tryOnType;
    }

    public void setTryOnType(String tryOnType) {
        this.tryOnType = tryOnType;
    }
}
