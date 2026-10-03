package com.tryonbd.backend.repository;
import com.tryonbd.backend.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;
public interface OrderRepository extends JpaRepository<Order, Long> {
    java.util.List<Order> findByUserId(Long userId);
}
