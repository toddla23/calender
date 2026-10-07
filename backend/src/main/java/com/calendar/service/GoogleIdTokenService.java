package com.calendar.service;

import com.google.api.client.googleapis.auth.oauth2.GoogleIdToken;
import com.google.api.client.googleapis.auth.oauth2.GoogleIdTokenVerifier;
import com.google.api.client.http.javanet.NetHttpTransport;
import com.google.api.client.json.gson.GsonFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/** Google ID Token을 Google 공개키로 검증한다. */
@Component
public class GoogleIdTokenService {

    private static final Logger log = LoggerFactory.getLogger(GoogleIdTokenService.class);

    public record GoogleIdentity(String sub, String email) {
    }

    private final GoogleIdTokenVerifier verifier;

    public GoogleIdTokenService(@Value("${calendar.google.client-ids}") String clientIds) {
        List<String> audience = Arrays.stream(clientIds.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).toList();
        if (audience.isEmpty()) {
            log.warn("calendar.google.client-ids가 비어 있어 Google 로그인이 모두 거부됩니다");
            this.verifier = null;
        } else {
            this.verifier = new GoogleIdTokenVerifier.Builder(new NetHttpTransport(), GsonFactory.getDefaultInstance())
                    .setAudience(audience)
                    .build();
        }
    }

    public Optional<GoogleIdentity> verify(String idToken) {
        if (verifier == null) {
            return Optional.empty();
        }
        try {
            GoogleIdToken token = verifier.verify(idToken);
            if (token == null) {
                return Optional.empty();
            }
            GoogleIdToken.Payload p = token.getPayload();
            if (!Boolean.TRUE.equals(p.getEmailVerified()) || p.getEmail() == null) {
                return Optional.empty();
            }
            return Optional.of(new GoogleIdentity(p.getSubject(), p.getEmail()));
        } catch (Exception e) {
            log.warn("Google ID Token 검증 실패: {}", e.getMessage());
            return Optional.empty();
        }
    }
}
