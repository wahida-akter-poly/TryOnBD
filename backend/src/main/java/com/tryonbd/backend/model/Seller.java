package com.tryonbd.backend.model;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "sellers")
public class Seller extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(nullable = false)
    private User user;
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    
    private String businessName;
    public String getBusinessName() { return businessName; }
    public void setBusinessName(String businessName) { this.businessName = businessName; }
    
    private String contactEmail;
    public String getContactEmail() { return contactEmail; }
    public void setContactEmail(String contactEmail) { this.contactEmail = contactEmail; }
    
    private String phone;
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    
    private String subscriptionStatus;
    public String getSubscriptionStatus() { return subscriptionStatus; }
    public void setSubscriptionStatus(String subscriptionStatus) { this.subscriptionStatus = subscriptionStatus; }
}
