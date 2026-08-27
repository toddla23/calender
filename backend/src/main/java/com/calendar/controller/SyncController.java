package com.calendar.controller;

import com.calendar.dto.NoteDto;
import com.calendar.dto.SyncResponse;
import com.calendar.service.SyncService;
import com.calendar.util.JwtTokenProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/sync")
@Slf4j
public class SyncController {
    private final SyncService syncService;
    private final JwtTokenProvider jwtTokenProvider;

    public SyncController(SyncService syncService, JwtTokenProvider jwtTokenProvider) {
        this.syncService = syncService;
        this.jwtTokenProvider = jwtTokenProvider;
    }

    @GetMapping("/pull")
    public ResponseEntity<SyncResponse> pullNotes(
        @RequestHeader("Authorization") String authHeader,
        @RequestParam(required = false) String since,
        @RequestParam(required = false) UUID cursor,
        @RequestParam(defaultValue = "50") int limit
    ) {
        UUID userId = extractUserId(authHeader);
        if (userId == null) {
            return ResponseEntity.status(401).build();
        }

        Instant sinceInstant = since != null ? Instant.parse(since) : null;
        SyncResponse response = syncService.pullNotes(userId, sinceInstant, cursor, limit);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/push")
    public ResponseEntity<List<SyncResponse.PushResult>> pushNotes(
        @RequestHeader("Authorization") String authHeader,
        @RequestBody List<NoteDto> noteDtos
    ) {
        UUID userId = extractUserId(authHeader);
        if (userId == null) {
            return ResponseEntity.status(401).build();
        }

        List<SyncResponse.PushResult> results = syncService.pushNotes(userId, noteDtos);
        return ResponseEntity.ok(results);
    }

    private UUID extractUserId(String authHeader) {
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            return null;
        }

        String token = authHeader.substring(7);
        if (!jwtTokenProvider.isTokenValid(token)) {
            return null;
        }

        return jwtTokenProvider.extractUserId(token);
    }
}
