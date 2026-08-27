package com.calendar.service;

import com.calendar.dto.NoteDto;
import com.calendar.dto.SyncResponse;
import com.calendar.entity.Note;
import com.calendar.repository.NoteRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@Slf4j
public class SyncService {
    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 100;

    private final NoteRepository noteRepository;

    public SyncService(NoteRepository noteRepository) {
        this.noteRepository = noteRepository;
    }

    @Transactional(readOnly = true)
    public SyncResponse pullNotes(UUID userId, Instant since, UUID cursor, int limit) {
        if (since == null) {
            since = Instant.EPOCH;
        }

        if (limit <= 0 || limit > MAX_LIMIT) {
            limit = DEFAULT_LIMIT;
        }

        Pageable pageable = PageRequest.of(0, limit + 1);
        Page<Note> page;

        if (cursor == null) {
            page = noteRepository.findByUserIdAndUpdatedAtGreaterThanEqualOrderByUpdatedAtAscIdAsc(
                userId, since, pageable
            );
        } else {
            page = noteRepository.findByUserIdAndUpdatedAtGreaterThanAndIdGreaterThanOrderByUpdatedAtAscIdAsc(
                userId, since, cursor, limit + 1
            );
        }

        List<Note> notes = page.getContent();
        boolean hasMore = notes.size() > limit;

        if (hasMore) {
            notes = notes.subList(0, limit);
        }

        List<NoteDto> items = notes.stream()
            .map(NoteDto::fromEntity)
            .collect(Collectors.toList());

        UUID nextCursor = null;
        if (hasMore && !items.isEmpty()) {
            nextCursor = items.get(items.size() - 1).getId();
        }

        return SyncResponse.builder()
            .items(items)
            .nextCursor(nextCursor)
            .hasMore(hasMore)
            .serverTime(Instant.now())
            .build();
    }

    @Transactional
    public List<SyncResponse.PushResult> pushNotes(UUID userId, List<NoteDto> noteDtos) {
        List<SyncResponse.PushResult> results = new ArrayList<>();

        for (NoteDto dto : noteDtos) {
            try {
                noteRepository.upsertNote(
                    dto.getId() != null ? dto.getId() : UUID.randomUUID(),
                    userId,
                    dto.getDate(),
                    dto.getContent(),
                    dto.getColor(),
                    dto.getDeleted() != null ? dto.getDeleted() : false,
                    dto.getDeletedVersion() != null ? dto.getDeletedVersion() : 0
                );

                results.add(new SyncResponse.PushResult(dto.getId(), true, null));
            } catch (Exception e) {
                log.error("Failed to upsert note {}: {}", dto.getId(), e.getMessage());
                results.add(new SyncResponse.PushResult(
                    dto.getId(),
                    false,
                    e.getMessage()
                ));
            }
        }

        return results;
    }
}
