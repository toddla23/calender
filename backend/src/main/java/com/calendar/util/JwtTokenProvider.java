package com.calendar.util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.UUID;

@Component
@Slf4j
public class JwtTokenProvider {
    private final Key key;
    private final long accessTokenExpiration;
    private final long refreshTokenExpiration;

    public JwtTokenProvider(
        @Value("${app.jwt.secret}") String secret,
        @Value("${app.jwt.access-token-expiration}") long accessTokenExpiration,
        @Value("${app.jwt.refresh-token-expiration}") long refreshTokenExpiration
    ) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.accessTokenExpiration = accessTokenExpiration;
        this.refreshTokenExpiration = refreshTokenExpiration;
    }

    public String generateAccessToken(UUID userId, String email) {
        return buildToken(userId, email, accessTokenExpiration);
    }

    public String generateRefreshToken(UUID userId, String email) {
        return buildToken(userId, email, refreshTokenExpiration);
    }

    private String buildToken(UUID userId, String email, long expirationMs) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expirationMs);

        return Jwts.builder()
            .setSubject(userId.toString())
            .claim("email", email)
            .setIssuedAt(now)
            .setExpiration(expiryDate)
            .signWith(key, SignatureAlgorithm.HS256)
            .compact();
    }

    public UUID extractUserId(String token) {
        try {
            Claims claims = extractAllClaims(token);
            return UUID.fromString(claims.getSubject());
        } catch (Exception e) {
            log.warn("Failed to extract userId from token", e);
            return null;
        }
    }

    public String extractEmail(String token) {
        try {
            Claims claims = extractAllClaims(token);
            return claims.get("email", String.class);
        } catch (Exception e) {
            log.warn("Failed to extract email from token", e);
            return null;
        }
    }

    public boolean isTokenValid(String token) {
        try {
            extractAllClaims(token);
            return true;
        } catch (Exception e) {
            log.warn("Invalid token", e);
            return false;
        }
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parserBuilder()
            .setSigningKey(key)
            .build()
            .parseClaimsJws(token)
            .getBody();
    }
}
