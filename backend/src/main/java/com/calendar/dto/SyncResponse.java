package com.calendar.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SyncResponse {
    private List<NoteDto> items;

    @JsonProperty("next_cursor")
    private UUID nextCursor;

    @JsonProperty("has_more")
    private Boolean hasMore;

    @JsonProperty("server_time")
    private Instant serverTime;

    @Getter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class PushResult {
        private UUID id;
        private Boolean success;
        private String error;
    }
}
