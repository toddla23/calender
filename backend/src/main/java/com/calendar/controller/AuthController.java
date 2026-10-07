package com.calendar.controller;

import com.calendar.dto.Dtos.AuthResponse;
import com.calendar.dto.Dtos.DevLoginRequest;
import com.calendar.dto.Dtos.GoogleLoginRequest;
import com.calendar.dto.Dtos.RefreshRequest;
import com.calendar.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/google")
    public AuthResponse google(@Valid @RequestBody GoogleLoginRequest req) {
        return auth.loginWithGoogle(req.idToken());
    }

    @PostMapping("/refresh")
    public AuthResponse refresh(@Valid @RequestBody RefreshRequest req) {
        return auth.refresh(req.refreshToken());
    }

    @PostMapping("/dev")
    public AuthResponse dev(@Valid @RequestBody DevLoginRequest req) {
        return auth.loginDev(req.email());
    }
}
