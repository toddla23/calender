package com.calendar.service;

import com.calendar.dto.AuthResponse;
import com.calendar.entity.User;
import com.calendar.repository.UserRepository;
import com.calendar.util.GoogleOAuthValidator;
import com.calendar.util.JwtTokenProvider;
import com.google.auth.oauth2.TokenVerifier.VerificationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@Slf4j
public class AuthService {
    private final UserRepository userRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final GoogleOAuthValidator googleOAuthValidator;

    public AuthService(
        UserRepository userRepository,
        JwtTokenProvider jwtTokenProvider,
        GoogleOAuthValidator googleOAuthValidator
    ) {
        this.userRepository = userRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.googleOAuthValidator = googleOAuthValidator;
    }

    @Transactional
    public AuthResponse authenticateWithGoogle(String idToken) throws VerificationException {
        var claims = googleOAuthValidator.verifyIdToken(idToken);

        if (!Boolean.TRUE.equals(claims.getEmailVerified())) {
            throw new IllegalStateException("Email not verified by Google");
        }

        User user = userRepository.findByGoogleSub(claims.getSub())
            .orElseGet(() -> {
                log.info("Creating new user with email: {}", claims.getEmail());
                User newUser = User.builder()
                    .email(claims.getEmail())
                    .googleSub(claims.getSub())
                    .build();
                return userRepository.save(newUser);
            });

        String accessToken = jwtTokenProvider.generateAccessToken(user.getId(), user.getEmail());
        String refreshToken = jwtTokenProvider.generateRefreshToken(user.getId(), user.getEmail());

        return AuthResponse.builder()
            .accessToken(accessToken)
            .refreshToken(refreshToken)
            .user(AuthResponse.UserInfo.builder()
                .id(user.getId())
                .email(user.getEmail())
                .build())
            .build();
    }

    public AuthResponse refreshAccessToken(String refreshToken) {
        if (!jwtTokenProvider.isTokenValid(refreshToken)) {
            throw new IllegalArgumentException("Invalid refresh token");
        }

        UUID userId = jwtTokenProvider.extractUserId(refreshToken);
        String email = jwtTokenProvider.extractEmail(refreshToken);

        if (userId == null || email == null) {
            throw new IllegalArgumentException("Could not extract claims from refresh token");
        }

        User user = userRepository.findById(userId)
            .orElseThrow(() -> new IllegalArgumentException("User not found"));

        String newAccessToken = jwtTokenProvider.generateAccessToken(userId, email);
        String newRefreshToken = jwtTokenProvider.generateRefreshToken(userId, email);

        return AuthResponse.builder()
            .accessToken(newAccessToken)
            .refreshToken(newRefreshToken)
            .user(AuthResponse.UserInfo.builder()
                .id(user.getId())
                .email(user.getEmail())
                .build())
            .build();
    }
}
