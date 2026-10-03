package com.tryonbd.backend.controller;
import com.tryonbd.backend.request.*;
import com.tryonbd.backend.response.SellerResponse;
import com.tryonbd.backend.service.PersistenceService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/sellers")
public class SellerController {
    private final PersistenceService service;
    public SellerController(PersistenceService service) { this.service = service; }
    @PostMapping
    public ResponseEntity<SellerResponse> create(@Valid @RequestBody CreateSellerRequest request) {
        var result = service.createSeller(request);
        return ResponseEntity.created(URI.create("/api/sellers/" + result.id())).body(result);
    }
    @GetMapping
    public List<SellerResponse> getAll() { return service.listSeller(); }
    @GetMapping("/{id}")
    public SellerResponse getById(@PathVariable("id") Long id) { return service.getSeller(id); }
    @PutMapping("/{id}")
    public SellerResponse update(@PathVariable("id") Long id, @Valid @RequestBody UpdateSellerRequest request) {
        return service.updateSeller(id, request);
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        service.deleteSeller(id);
        return ResponseEntity.noContent().build();
    }
}
