package com.calendar.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;

@Component
public class JwtTokenProvider {

    private static final String TYPE = "typ";
    public static final String ACCESS = "access";
    public static final String REFRESH = "refresh";

    private final SecretKey key;
    private final Duration accessTtl;
    private final Duration refreshTtl;

    public JwtTokenProvider(@Value("${calendar.jwt.secret}") String secret,
                            @Value("${calendar.jwt.access-ttl-minutes}") long accessMinutes,
                            @Value("${calendar.jwt.refresh-ttl-days}") long refreshDays) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("calendar.jwt.secret은 32바이트 이상이어야 합니다");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.accessTtl = Duration.ofMinutes(accessMinutes);
        this.refreshTtl = Duration.ofDays(refreshDays);
    }

    public String createAccessToken(String userId, String email) {
        return build(userId, email, ACCESS, accessTtl);
    }

    public String createRefreshToken(String userId) {
        return build(userId, null, REFRESH, refreshTtl);
    }

    public long accessTtlSeconds() {
        return accessTtl.toSeconds();
    }

    /** 유효한 access 토큰이면 userId, 아니면 empty. */
    public Optional<String> parseAccess(String token) {
        return parse(token, ACCESS);
    }

    public Optional<String> parseRefresh(String token) {
        return parse(token, REFRESH);
    }

    private String build(String userId, String email, String type, Duration ttl) {
        Instant now = Instant.now();
        var builder = Jwts.builder()
                .subject(userId)
                .claim(TYPE, type)
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)));
        if (email != null) {
            builder.claim("email", email);
        }
        return builder.signWith(key).compact();
    }

    private Optional<String> parse(String token, String expectedType) {
        try {
            Claims claims = Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
            if (!expectedType.equals(claims.get(TYPE, String.class))) {
                return Optional.empty();
            }
            return Optional.ofNullable(claims.getSubject());
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
