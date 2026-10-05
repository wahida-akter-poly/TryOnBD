package com.tryonbd.backend.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

public class UpdateProductRequest {

    @NotNull
    private Integer categoryId;

    @NotBlank
    private String name;

    @NotNull
    @PositiveOrZero
    private java.math.BigDecimal price;

    @NotNull
    @PositiveOrZero
    private Integer stockQuantity;

    private String imageUrl;

    public Integer getCategoryId() {
        return categoryId;
    }

    public void setCategoryId(Integer categoryId) {
        this.categoryId = categoryId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public java.math.BigDecimal getPrice() {
        return price;
    }

    public void setPrice(java.math.BigDecimal price) {
        this.price = price;
    }

    public Integer getStockQuantity() {
        return stockQuantity;
    }

    public void setStockQuantity(Integer stockQuantity) {
        this.stockQuantity = stockQuantity;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }
    private String description;
    private String arType;
    public String getDescription() { return description; }
    public void setDescription(String value) { description = value; }
    public String getArType() { return arType; }
    public void setArType(String value) { arType = value; }
    private java.util.Map<String, Object> arMetadata;
    public java.util.Map<String, Object> getArMetadata() { return arMetadata; }
    public void setArMetadata(java.util.Map<String, Object> value) { arMetadata = value; }
}
