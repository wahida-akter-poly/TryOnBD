package com.tryonbd.backend.model;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "products")
public class Product extends BaseEntity {
    
    // Only the opt-in local importer assigns this unique, stable package identity.
    @Column(unique = true, length = 180)
    private String assetKey;
    public String getAssetKey() { return assetKey; }
    public void setAssetKey(String value) { assetKey = value; }

    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private java.util.Map<String, Object> arMetadata;
    public java.util.Map<String, Object> getArMetadata() { return arMetadata; }
    public void setArMetadata(java.util.Map<String, Object> value) { arMetadata = value; }

    // Last approved package values allow sync to preserve later seller edits and sales.
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private java.util.Map<String, Object> assetManifest;
    public java.util.Map<String, Object> getAssetManifest() { return assetManifest; }
    public void setAssetManifest(java.util.Map<String, Object> value) { assetManifest = value; }

    private String name;
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    
    private String description;
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal price;
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    
    private String imageUrl;
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    
    private String arType;
    public String getArType() { return arType; }
    public void setArType(String arType) { this.arType = arType; }
    
    private Integer stockQuantity;
    public Integer getStockQuantity() { return stockQuantity; }
    public void setStockQuantity(Integer stockQuantity) { this.stockQuantity = stockQuantity; }
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(nullable = false)
    private Category category;
    public Category getCategory() { return category; }
    public void setCategory(Category category) { this.category = category; }
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(nullable = false)
    private Seller seller;
    public Seller getSeller() { return seller; }
    public void setSeller(Seller seller) { this.seller = seller; }
}
