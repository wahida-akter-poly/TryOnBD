package com.tryonbd.backend.repository;
import com.tryonbd.backend.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
public interface UserRepository extends JpaRepository<User, Long> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select u from User u where u.id = :id")
    java.util.Optional<User> lockById(@org.springframework.data.repository.query.Param("id") Long id);
    java.util.Optional<User> findByEmail(String email);
}
