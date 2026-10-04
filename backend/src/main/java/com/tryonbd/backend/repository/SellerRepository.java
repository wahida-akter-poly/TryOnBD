package com.tryonbd.backend.repository;
import com.tryonbd.backend.model.Seller;
import org.springframework.data.jpa.repository.JpaRepository;
public interface SellerRepository extends JpaRepository<Seller, Long> {
    java.util.Optional<Seller> findFirstByUserIdOrderByIdAsc(Long userId);
    boolean existsByUserId(Long userId);

}
