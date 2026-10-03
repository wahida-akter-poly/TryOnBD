package com.tryonbd.backend.controller;
import com.tryonbd.backend.request.*;
import com.tryonbd.backend.response.CartResponse;
import com.tryonbd.backend.service.PersistenceService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/carts")
public class CartController {
    private final PersistenceService service;
    public CartController(PersistenceService service) { this.service = service; }
    @PostMapping
    public ResponseEntity<CartResponse> create(@Valid @RequestBody CreateCartRequest request) {
        var result = service.createCart(request);
        return ResponseEntity.created(URI.create("/api/carts/" + result.id())).body(result);
    }
    @GetMapping
    public List<CartResponse> getAll() { return service.listCart(); }
    @GetMapping("/{id}")
    public CartResponse getById(@PathVariable("id") Long id) { return service.getCart(id); }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        service.deleteCart(id);
        return ResponseEntity.noContent().build();
    }
}
