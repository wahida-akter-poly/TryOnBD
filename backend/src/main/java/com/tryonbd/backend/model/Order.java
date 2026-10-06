package com.tryonbd.backend.model;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "orders")
public class Order extends BaseEntity {
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private java.util.List<java.util.Map<String, Object>> items = new java.util.ArrayList<>();
    public java.util.List<java.util.Map<String, Object>> getItems() { return items == null ? new java.util.ArrayList<>() : items; }
    public void setItems(java.util.List<java.util.Map<String, Object>> items) { this.items = items; }
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(nullable = false)
    private User user;
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    @Column(nullable = false, precision = 19, scale = 2)
    private BigDecimal totalAmount;
    public BigDecimal getTotalAmount() { return totalAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
    
    private String orderStatus;
    public String getOrderStatus() { return orderStatus; }
    public void setOrderStatus(String orderStatus) { this.orderStatus = orderStatus; }
}
