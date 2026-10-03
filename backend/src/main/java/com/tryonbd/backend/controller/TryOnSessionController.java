package com.tryonbd.backend.controller;
import com.tryonbd.backend.request.*;
import com.tryonbd.backend.response.TryOnSessionResponse;
import com.tryonbd.backend.service.PersistenceService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/try-on-sessions")
public class TryOnSessionController {
    private final PersistenceService service;
    public TryOnSessionController(PersistenceService service) { this.service = service; }
    @PostMapping
    public ResponseEntity<TryOnSessionResponse> create(@Valid @RequestBody CreateTryOnSessionRequest request) {
        var result = service.createTryOnSession(request);
        return ResponseEntity.created(URI.create("/api/try-on-sessions/" + result.id())).body(result);
    }
    @GetMapping
    public List<TryOnSessionResponse> getAll() { return service.listTryOnSession(); }
    @GetMapping("/{id}")
    public TryOnSessionResponse getById(@PathVariable("id") Long id) { return service.getTryOnSession(id); }
    @PutMapping("/{id}/result")
    public TryOnSessionResponse update(@PathVariable("id") Long id, @Valid @RequestBody UpdateTryOnResultRequest request) {
        return service.updateTryOnSession(id, request);
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        service.deleteTryOnSession(id);
        return ResponseEntity.noContent().build();
    }
}
