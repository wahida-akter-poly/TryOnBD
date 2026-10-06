package com.tryonbd.backend.repository;
import com.tryonbd.backend.model.TryOnSession;
import org.springframework.data.jpa.repository.JpaRepository;
public interface TryOnSessionRepository extends JpaRepository<TryOnSession, Long> {
    java.util.List<TryOnSession> findByUserId(Long userId);
}
