package com.calendar.dto;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public final class Dtos {

    private Dtos() {
    }

    // ---- 인증 ----

    public record GoogleLoginRequest(@NotBlank String idToken) {
    }

    public record DevLoginRequest(@NotBlank @Email String email) {
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
    }

    public record UserInfo(String id, String email) {
    }

    public record AuthResponse(String accessToken, String refreshToken, long expiresIn, UserInfo user) {
    }

    // ---- 동기화 ----

    /** 클라이언트가 보내는 변경. updatedAt은 받지 않는다 (서버가 발급). */
    public record PushItem(
            @NotNull @Pattern(regexp = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
                    message = "id는 UUID 형식이어야 합니다") String id,
            @NotNull LocalDate date,
            @NotNull @Size(max = 20000) String content,
            @Size(max = 32) String color,
            boolean deleted,
            @Min(0) @JsonProperty("deleted_version") @JsonAlias("deletedVersion") int deletedVersion
    ) {
    }

    /** 거부(CONFLICT_DELETED)된 경우 note에 서버의 현재 상태를 실어 클라이언트가 즉시 맞추게 한다. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PushResult(String id, boolean success, String error, NoteDto note) {
        public static PushResult ok(String id) {
            return new PushResult(id, true, null, null);
        }

        public static PushResult fail(String id, String error) {
            return new PushResult(id, false, error, null);
        }

        public static PushResult conflict(String id, NoteDto serverNote) {
            return new PushResult(id, false, "CONFLICT_DELETED", serverNote);
        }
    }

    public record NoteDto(
            String id,
            LocalDate date,
            String content,
            String color,
            boolean deleted,
            @JsonProperty("deleted_version") int deletedVersion,
            Instant updatedAt
    ) {
    }

    public record PullResponse(List<NoteDto> items, String nextCursor, boolean hasMore, Instant serverTime) {
    }

    // ---- 실시간 ----

    /** WebSocket broadcast. origin이 자기 자신이면 수신 측에서 무시한다 (에코 루프 방지). */
    public record NoteEvent(String type, NoteDto note, String originDeviceId, String originConnectionId) {
    }

    // ---- 공휴일 ----

    public record HolidayDto(LocalDate date, String name) {
    }
}
