package com.calendar.controller;

import com.calendar.dto.AuthRequest;
import com.calendar.dto.AuthResponse;
import com.calendar.service.AuthService;
import com.google.auth.oauth2.TokenVerifier.VerificationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@Slf4j
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/google")
    public ResponseEntity<?> authenticateGoogle(@RequestBody AuthRequest.GoogleAuth request) {
        try {
            AuthResponse response = authService.authenticateWithGoogle(request.getIdToken());
            return ResponseEntity.ok(response);
        } catch (VerificationException e) {
            log.warn("Google ID token verification failed", e);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("Invalid Google ID token: " + e.getMessage()));
        } catch (IllegalStateException e) {
            log.warn("Google authentication failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("Authentication failed: " + e.getMessage()));
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refreshToken(@RequestBody AuthRequest.RefreshToken request) {
        try {
            AuthResponse response = authService.refreshAccessToken(request.getRefreshToken());
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            log.warn("Token refresh failed", e);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(new ErrorResponse("Invalid refresh token: " + e.getMessage()));
        }
    }

    @lombok.Getter
    @lombok.AllArgsConstructor
    public static class ErrorResponse {
        private String error;
    }
}
