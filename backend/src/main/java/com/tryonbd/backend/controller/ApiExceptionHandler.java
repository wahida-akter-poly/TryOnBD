package com.tryonbd.backend.controller;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(org.springframework.security.core.AuthenticationException.class)
    public ResponseEntity<Map<String,String>> unauthorized(Exception error) { return ResponseEntity.status(401).body(Map.of("message", "Invalid email or password")); }
    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public ResponseEntity<Map<String,String>> rejected(org.springframework.web.server.ResponseStatusException error) { return ResponseEntity.status(error.getStatusCode()).body(Map.of("message", error.getReason() == null ? "Request rejected" : error.getReason())); }
    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> conflict(DataIntegrityViolationException error) {
        return ResponseEntity.status(409).body(Map.of("message",
            "A unique value already exists or another record references this record."));
    }
}
