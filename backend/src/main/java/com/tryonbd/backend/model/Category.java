package com.tryonbd.backend.model;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "categories")
public class Category extends BaseEntity {
    
    private String categoryName;
    public String getCategoryName() { return categoryName; }
    public void setCategoryName(String categoryName) { this.categoryName = categoryName; }
    
    private String description;
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    @ManyToOne(fetch = FetchType.LAZY)
    private Category parentCategory;
    public Category getParentCategory() { return parentCategory; }
    public void setParentCategory(Category parentCategory) { this.parentCategory = parentCategory; }
}
