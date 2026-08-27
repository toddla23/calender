package com.calendar.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

public class AuthRequest {
    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class GoogleAuth {
        @NotBlank(message = "ID Token is required")
        private String idToken;
    }

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RefreshToken {
        @NotBlank(message = "Refresh Token is required")
        private String refreshToken;
    }
}
