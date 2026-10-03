package com.tryonbd.backend.repository;
import com.tryonbd.backend.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ProductRepository extends JpaRepository<Product, Long> {
    java.util.List<Product> findByCategoryId(Long categoryId);
    java.util.List<Product> findBySellerId(Long sellerId);
}
