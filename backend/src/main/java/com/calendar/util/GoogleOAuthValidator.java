package com.calendar.util;

import com.google.auth.oauth2.TokenVerifier;
import com.google.auth.oauth2.TokenVerifier.VerificationException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class GoogleOAuthValidator {
    private final TokenVerifier tokenVerifier;
    private final String expectedClientId;

    public GoogleOAuthValidator(@Value("${app.google.client-id}") String expectedClientId) {
        this.expectedClientId = expectedClientId;
        this.tokenVerifier = TokenVerifier.newBuilder()
            .setAudience(expectedClientId)
            .build();
    }

    public GoogleOAuthValidator.GoogleIdTokenClaims verifyIdToken(String idToken) throws VerificationException {
        try {
            var idTokenCredential = tokenVerifier.verify(idToken);
            var claims = idTokenCredential.getPayload();

            return GoogleIdTokenClaims.builder()
                .sub(claims.getSubject())
                .email((String) claims.get("email"))
                .emailVerified((Boolean) claims.get("email_verified"))
                .name((String) claims.get("name"))
                .picture((String) claims.get("picture"))
                .build();
        } catch (VerificationException e) {
            log.warn("Failed to verify Google ID token: {}", e.getMessage());
            throw e;
        }
    }

    @lombok.Getter
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    @lombok.Builder
    public static class GoogleIdTokenClaims {
        private String sub;
        private String email;
        private Boolean emailVerified;
        private String name;
        private String picture;
    }
}
