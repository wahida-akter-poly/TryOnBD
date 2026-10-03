package com.tryonbd.backend.repository;
import com.tryonbd.backend.model.Cart;
import org.springframework.data.jpa.repository.JpaRepository;
public interface CartRepository extends JpaRepository<Cart, Long> {
    java.util.List<Cart> findByUserId(Long userId);
}
