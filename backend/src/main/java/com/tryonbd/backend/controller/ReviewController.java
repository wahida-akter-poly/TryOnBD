package com.tryonbd.backend.controller;

import com.tryonbd.backend.request.CreateReviewRequest;
import com.tryonbd.backend.request.UpdateReviewRequest;
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
@RequestMapping("/api/reviews")
public class ReviewController {

    // TODO: Integrate service layer and database in the next phase.

    @PostMapping
    public ResponseEntity<CreateReviewRequest> create(@Valid @RequestBody CreateReviewRequest request) {
        return ResponseEntity.ok(request);
    }

    @GetMapping
    public ResponseEntity<String> getAll() {
        return ResponseEntity.ok("Listing reviews: service/database integration will be implemented in the next phase.");
    }

    @GetMapping("/{id}")
    public ResponseEntity<String> getById(@PathVariable("id") Integer id) {
        return ResponseEntity.ok("Fetching reviews with ID " + id
                + ": service/database integration will be implemented in the next phase.");
    }

    @PutMapping("/{id}")
    public ResponseEntity<UpdateReviewRequest> update(@PathVariable("id") Integer id,
            @Valid @RequestBody UpdateReviewRequest request) {
        return ResponseEntity.ok(request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<String> delete(@PathVariable("id") Integer id) {
        return ResponseEntity.ok("Deleting reviews with ID " + id
                + ": service/database integration will be implemented in the next phase.");
    }
}
