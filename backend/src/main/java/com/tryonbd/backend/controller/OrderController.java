package com.tryonbd.backend.controller;
import com.tryonbd.backend.request.*;
import com.tryonbd.backend.response.OrderResponse;
import com.tryonbd.backend.service.PersistenceService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    private final PersistenceService service;
    public OrderController(PersistenceService service) { this.service = service; }
    @PostMapping
    public ResponseEntity<OrderResponse> create(@RequestBody(required = false) CreateOrderRequest request) {
        var result = service.createOrder(request);
        return ResponseEntity.created(URI.create("/api/orders/" + result.id())).body(result);
    }
    @GetMapping
    public List<OrderResponse> getAll() { return service.listOrder(); }
    @GetMapping("/{id}")
    public OrderResponse getById(@PathVariable("id") Long id) { return service.getOrder(id); }
    @PutMapping("/{id}/status")
    public OrderResponse update(@PathVariable("id") Long id, @Valid @RequestBody UpdateOrderStatusRequest request) {
        return service.updateOrder(id, request);
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        service.deleteOrder(id);
        return ResponseEntity.noContent().build();
    }
}
