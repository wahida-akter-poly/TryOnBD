package com.tryonbd.backend.controller;
import com.tryonbd.backend.request.*;
import com.tryonbd.backend.response.UserResponse;
import com.tryonbd.backend.service.PersistenceService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping("/api/users")
public class UserController {
    private final PersistenceService service;
    public UserController(PersistenceService service) { this.service = service; }
    @PostMapping
    public ResponseEntity<UserResponse> create(@Valid @RequestBody CreateUserRequest request) {
        var result = service.createUser(request);
        return ResponseEntity.created(URI.create("/api/users/" + result.id())).body(result);
    }
    @GetMapping
    public List<UserResponse> getAll() { return service.listUser(); }
    @GetMapping("/{id}")
    public UserResponse getById(@PathVariable("id") Long id) { return service.getUser(id); }
    @PutMapping("/{id}")
    public UserResponse update(@PathVariable("id") Long id, @Valid @RequestBody UpdateUserRequest request) {
        return service.updateUser(id, request);
    }
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable("id") Long id) {
        service.deleteUser(id);
        return ResponseEntity.noContent().build();
    }
}
