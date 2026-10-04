package com.tryonbd.backend.model;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "carts")
public class Cart extends BaseEntity {
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private java.util.Map<String, Integer> items = new java.util.TreeMap<>();
    public java.util.Map<String, Integer> getItems() { return items == null ? new java.util.TreeMap<>() : items; }
    public void setItems(java.util.Map<String, Integer> items) { this.items = items; }
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(nullable = false)
    private User user;
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    
    private LocalDateTime updatedAt = LocalDateTime.now();
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
    @PreUpdate
    void touch() { updatedAt = LocalDateTime.now(); }
}
