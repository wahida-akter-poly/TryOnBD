package com.tryonbd.backend.controller;

import com.tryonbd.backend.request.CreateUserRequest;
import com.tryonbd.backend.request.UpdateUserRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
public class UserController {

    // TODO: Integrate service layer and database in the next phase.

    @PostMapping
    public ResponseEntity<CreateUserRequest> create(@Valid @RequestBody CreateUserRequest request) {
        return ResponseEntity.ok(request);
    }

    @GetMapping
    public ResponseEntity<String> getAll() {
        return ResponseEntity.ok("Listing users: service/database integration will be implemented in the next phase.");
    }

    @GetMapping("/{id}")
    public ResponseEntity<String> getById(@PathVariable("id") Integer id) {
        return ResponseEntity.ok("Fetching users with ID " + id
                + ": service/database integration will be implemented in the next phase.");
    }

    @PutMapping("/{id}")
    public ResponseEntity<UpdateUserRequest> update(@PathVariable("id") Integer id,
            @Valid @RequestBody UpdateUserRequest request) {
        return ResponseEntity.ok(request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<String> delete(@PathVariable("id") Integer id) {
        return ResponseEntity.ok("Deleting users with ID " + id
                + ": service/database integration will be implemented in the next phase.");
    }
}
