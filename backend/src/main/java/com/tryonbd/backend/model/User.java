package com.tryonbd.backend.model;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
public class User extends BaseEntity {
    
    private String fullName;
    public String getFullName() { return fullName; }
    public void setFullName(String fullName) { this.fullName = fullName; }
    @Column(nullable = false, unique = true)
    private String email;
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    
    private String password;
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    
    private String phone;
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    
    private String address;
    public String getAddress() { return address; }
    public void setAddress(String address) { this.address = address; }
    
    private String role;
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
}
