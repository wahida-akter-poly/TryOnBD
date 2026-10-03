package com.tryonbd.backend.repository;
import com.tryonbd.backend.model.Category;
import org.springframework.data.jpa.repository.JpaRepository;
public interface CategoryRepository extends JpaRepository<Category, Long> {

}
