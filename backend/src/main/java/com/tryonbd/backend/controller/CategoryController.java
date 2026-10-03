package com.tryonbd.backend.controller;
import com.tryonbd.backend.request.*;
import com.tryonbd.backend.response.CategoryResponse;
import com.tryonbd.backend.service.PersistenceService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/categories")
public class CategoryController {
    private final PersistenceService service;
    public CategoryController(PersistenceService service) { this.service = service; }
    @PostMapping
    public ResponseEntity<CategoryResponse> create(@Valid @RequestBody CreateCategoryRequest request) {
        var result = service.createCategory(request);
        return ResponseEntity.created(URI.create("/api/categories/" + result.id())).body(result);
    }
    @GetMapping
    public List<CategoryResponse> getAll() { return service.listCategory(); }
    @GetMapping("/{id}")
    public CategoryResponse getById(@PathVariable("id") Long id) { return service.getCategory(id); }
    @PutMapping("/{id}")
    public CategoryResponse update(@PathVariable("id") Long id, @Valid @RequestBody UpdateCategoryRequest request) {
        return service.updateCategory(id, request);
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        service.deleteCategory(id);
        return ResponseEntity.noContent().build();
    }
}
