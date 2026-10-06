package com.tryonbd.backend.model;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "try_on_sessions")
public class TryOnSession extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(nullable = false)
    private User user;
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(nullable = false)
    private Product product;
    public Product getProduct() { return product; }
    public void setProduct(Product product) { this.product = product; }
    
    private String tryOnType;
    public String getTryOnType() { return tryOnType; }
    public void setTryOnType(String tryOnType) { this.tryOnType = tryOnType; }
    
    private String inputImageUrl;
    public String getInputImageUrl() { return inputImageUrl; }
    public void setInputImageUrl(String inputImageUrl) { this.inputImageUrl = inputImageUrl; }
    
    private String resultImageUrl;
    public String getResultImageUrl() { return resultImageUrl; }
    public void setResultImageUrl(String resultImageUrl) { this.resultImageUrl = resultImageUrl; }
}
