package com.tryonbd.backend.controller;
import com.tryonbd.backend.request.*;
import com.tryonbd.backend.response.ProductResponse;
import com.tryonbd.backend.service.PersistenceService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/products")
public class ProductController {
    private final PersistenceService service;
    public ProductController(PersistenceService service) { this.service = service; }
    @PostMapping
    public ResponseEntity<ProductResponse> create(@Valid @RequestBody CreateProductRequest request) {
        var result = service.createProduct(request);
        return ResponseEntity.created(URI.create("/api/products/" + result.id())).body(result);
    }
    @GetMapping
    public List<ProductResponse> getAll() { return service.listProduct(); }
    @GetMapping("/{id}")
    public ProductResponse getById(@PathVariable("id") Long id) { return service.getProduct(id); }
    @PutMapping("/{id}")
    public ProductResponse update(@PathVariable("id") Long id, @Valid @RequestBody UpdateProductRequest request) {
        return service.updateProduct(id, request);
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        service.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }
}
