package com.tryonbd.backend.controller;

import com.tryonbd.backend.request.CreateSellerRequest;
import com.tryonbd.backend.request.UpdateSellerRequest;
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
@RequestMapping("/api/sellers")
public class SellerController {

    // TODO: Integrate service layer and database in the next phase.

    @PostMapping
    public ResponseEntity<CreateSellerRequest> create(@Valid @RequestBody CreateSellerRequest request) {
        return ResponseEntity.ok(request);
    }

    @GetMapping
    public ResponseEntity<String> getAll() {
        return ResponseEntity.ok("Listing sellers: service/database integration will be implemented in the next phase.");
    }

    @GetMapping("/{id}")
    public ResponseEntity<String> getById(@PathVariable("id") Integer id) {
        return ResponseEntity.ok("Fetching sellers with ID " + id
                + ": service/database integration will be implemented in the next phase.");
    }

    @PutMapping("/{id}")
    public ResponseEntity<UpdateSellerRequest> update(@PathVariable("id") Integer id,
            @Valid @RequestBody UpdateSellerRequest request) {
        return ResponseEntity.ok(request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<String> delete(@PathVariable("id") Integer id) {
        return ResponseEntity.ok("Deleting sellers with ID " + id
                + ": service/database integration will be implemented in the next phase.");
    }
}
