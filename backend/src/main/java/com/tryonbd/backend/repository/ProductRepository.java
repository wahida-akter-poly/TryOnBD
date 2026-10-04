package com.tryonbd.backend.repository;
import com.tryonbd.backend.model.Product;
import org.springframework.data.jpa.repository.JpaRepository;
public interface ProductRepository extends JpaRepository<Product, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select p from Product p where p.id = :id")
    java.util.Optional<Product> lockById(@org.springframework.data.repository.query.Param("id") Long id);
    java.util.List<Product> findByCategoryId(Long categoryId);
    java.util.List<Product> findBySellerId(Long sellerId);
    java.util.List<Product> findBySellerUserId(Long userId);
}
