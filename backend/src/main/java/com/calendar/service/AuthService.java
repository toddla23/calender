package com.calendar.service;

import com.calendar.dto.Dtos.AuthResponse;
import com.calendar.dto.Dtos.UserInfo;
import com.calendar.entity.User;
import com.calendar.exception.ApiException;
import com.calendar.repository.UserRepository;
import com.calendar.security.JwtTokenProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final GoogleIdTokenService google;
    private final UserRepository users;
    private final JwtTokenProvider tokens;
    private final boolean devLoginEnabled;

    public AuthService(GoogleIdTokenService google, UserRepository users, JwtTokenProvider tokens,
                       @Value("${calendar.auth.dev-login-enabled}") boolean devLoginEnabled) {
        this.google = google;
        this.users = users;
        this.tokens = tokens;
        this.devLoginEnabled = devLoginEnabled;
    }

    public AuthResponse loginWithGoogle(String idToken) {
        var identity = google.verify(idToken)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_ID_TOKEN",
                        "Google 인증에 실패했습니다"));
        return issue(findOrCreate(identity.sub(), identity.email()));
    }

    /** 로컬 개발용: Google 없이 이메일로 로그인. 운영에서는 비활성. */
    public AuthResponse loginDev(String email) {
        if (!devLoginEnabled) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "존재하지 않는 경로입니다");
        }
        return issue(findOrCreate("dev:" + email.toLowerCase(), email.toLowerCase()));
    }

    @Transactional(readOnly = true)
    public AuthResponse refresh(String refreshToken) {
        String userId = tokens.parseRefresh(refreshToken)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH_TOKEN",
                        "Refresh Token이 유효하지 않습니다. 다시 로그인해 주세요"));
        User user = users.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH_TOKEN",
                        "Refresh Token이 유효하지 않습니다. 다시 로그인해 주세요"));
        return issue(user);
    }

    private User findOrCreate(String sub, String email) {
        return users.findByGoogleSub(sub).orElseGet(() -> {
            try {
                return users.saveAndFlush(new User(email, sub));
            } catch (DataIntegrityViolationException race) {
                // 동시 최초 로그인 경합: 먼저 생성된 로우를 사용
                return users.findByGoogleSub(sub).orElseThrow(() -> race);
            }
        });
    }

    private AuthResponse issue(User user) {
        return new AuthResponse(
                tokens.createAccessToken(user.getId(), user.getEmail()),
                tokens.createRefreshToken(user.getId()),
                tokens.accessTtlSeconds(),
                new UserInfo(user.getId(), user.getEmail()));
    }
}
