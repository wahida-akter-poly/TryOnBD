package com.tryonbd.backend.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.List;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class JwtService {

    private static final long EXPIRATION_MS = 1000L * 60 * 60 * 24;

    private final SecretKey signingKey;

    public JwtService(@Value("${jwt.secret:development-secret-key-tryonbd-32chars}") String secret) {
        if (secret == null || secret.length() < 32) {
            throw new IllegalArgumentException("JWT_SECRET must contain at least 32 characters");
        }
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    }

    public String generateToken(Long userId, String email, String role) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(email)
            .claim("userId", userId)
            .claim("role", role)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusMillis(EXPIRATION_MS)))
            .signWith(signingKey)
            .compact();
    }

    public String extractEmail(String token) {
        return claims(token).getSubject();
    }

    public Long extractUserId(String token) {
        Object value = claims(token).get("userId");
        if (value instanceof Number number) {
            return number.longValue();
        }
        return null;
    }

    public String extractRole(String token) {
        Object value = claims(token).get("role");
        return value == null ? null : value.toString();
    }

    public boolean isTokenValid(String token) {
        try {
            claims(token);
            return true;
        } catch (Exception ex) {
            return false;
        }
    }

    private Claims claims(String token) {
        return Jwts.parser()
            .verifyWith(signingKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
}
