package com.calendar.service;

import com.calendar.dto.Dtos.NoteDto;
import com.calendar.dto.Dtos.NoteEvent;
import com.calendar.dto.Dtos.PullResponse;
import com.calendar.dto.Dtos.PushItem;
import com.calendar.dto.Dtos.PushResult;
import com.calendar.entity.Note;
import com.calendar.exception.ApiException;
import com.calendar.repository.NoteRepository;
import com.calendar.repository.NoteUpsertRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

@Service
public class SyncService {

    private static final Logger log = LoggerFactory.getLogger(SyncService.class);

    /**
     * serverTime을 실제 시각보다 약간 과거로 내려준다. 커밋이 늦어 updated_at이 serverTime보다
     * 과거로 보이는 쓰기를 다음 Pull이 놓치지 않기 위함 (중복 수신은 클라이언트가 멱등 처리).
     */
    private static final Duration SERVER_TIME_LOOKBACK = Duration.ofSeconds(5);
    public static final int DEFAULT_LIMIT = 50;
    public static final int MAX_LIMIT = 200;

    private final NoteRepository notes;
    private final NoteUpsertRepository upserts;
    private final TransactionTemplate tx;
    private final SimpMessagingTemplate broker;

    public SyncService(NoteRepository notes, NoteUpsertRepository upserts, TransactionTemplate tx,
                       SimpMessagingTemplate broker) {
        this.notes = notes;
        this.upserts = upserts;
        this.tx = tx;
        this.broker = broker;
    }

    /** 항목 단위로 성공/실패를 응답한다. 일부 실패해도 나머지는 반영된다. */
    public List<PushResult> push(String userId, List<PushItem> items, String deviceId, String connectionId) {
        List<PushResult> results = new ArrayList<>(items.size());
        for (PushItem item : items) {
            try {
                Applied applied = tx.execute(status -> applyOne(userId, item));
                if (applied.rejected()) {
                    results.add(PushResult.conflict(item.id(), toDto(applied.note())));
                    continue;
                }
                results.add(PushResult.ok(item.id()));
                publish(userId, applied.note(), deviceId, connectionId);
            } catch (ForbiddenNoteException e) {
                results.add(PushResult.fail(item.id(), "FORBIDDEN"));
            } catch (Exception e) {
                log.error("push 항목 처리 실패 id={}", item.id(), e);
                results.add(PushResult.fail(item.id(), "INTERNAL_ERROR"));
            }
        }
        return results;
    }

    private record Applied(Note note, boolean rejected) {
    }

    /** 삭제된 항목에 대한 오래된 수정이면 rejected=true. note는 항상 서버의 현재 로우. */
    private Applied applyOne(String userId, PushItem item) {
        upserts.upsert(userId, item);
        Note stored = notes.findById(item.id().toLowerCase()).orElseThrow();
        if (!stored.getUserId().equals(userId)) {
            throw new ForbiddenNoteException();
        }
        return new Applied(stored, !item.deleted() && stored.isDeleted());
    }

    public PullResponse pull(String userId, Instant since, String cursor, Integer limitParam) {
        int limit = limitParam == null ? DEFAULT_LIMIT : Math.min(Math.max(limitParam, 1), MAX_LIMIT);
        PageRequest page = PageRequest.of(0, limit + 1);

        List<Note> rows;
        if (cursor == null || cursor.isBlank()) {
            rows = notes.findFirstPage(userId, since == null ? Instant.EPOCH : since, page);
        } else {
            Cursor c = Cursor.decode(cursor);
            rows = notes.findAfterCursor(userId, c.time(), c.id(), page);
        }

        boolean hasMore = rows.size() > limit;
        List<Note> pageRows = hasMore ? rows.subList(0, limit) : rows;
        String nextCursor = null;
        if (hasMore) {
            Note last = pageRows.get(pageRows.size() - 1);
            nextCursor = Cursor.encode(last.getUpdatedAt(), last.getId());
        }

        return new PullResponse(
                pageRows.stream().map(SyncService::toDto).toList(),
                nextCursor,
                hasMore,
                upserts.dbNow().minus(SERVER_TIME_LOOKBACK));
    }

    private void publish(String userId, Note note, String deviceId, String connectionId) {
        try {
            broker.convertAndSend("/topic/notes/" + userId,
                    new NoteEvent("UPSERT", toDto(note), deviceId, connectionId));
        } catch (Exception e) {
            // WebSocket은 보조 채널. 실패해도 다음 Pull이 정합성을 보장한다.
            log.warn("broadcast 실패 id={}: {}", note.getId(), e.getMessage());
        }
    }

    static NoteDto toDto(Note n) {
        return new NoteDto(n.getId(), n.getDate(), n.getContent(), n.getColor(), n.isDeleted(),
                n.getDeletedVersion(), n.getUpdatedAt());
    }

    private static final class ForbiddenNoteException extends RuntimeException {
        ForbiddenNoteException() {
            super(null, null, false, false);
        }
    }

    /** (updatedAt, id) 복합 커서. 클라이언트에는 불투명 문자열로 노출된다. */
    private record Cursor(Instant time, String id) {

        static String encode(Instant time, String id) {
            String raw = time + "|" + id;
            return Base64.getUrlEncoder().withoutPadding().encodeToString(raw.getBytes(StandardCharsets.UTF_8));
        }

        static Cursor decode(String cursor) {
            try {
                String raw = new String(Base64.getUrlDecoder().decode(cursor), StandardCharsets.UTF_8);
                int sep = raw.indexOf('|');
                return new Cursor(Instant.parse(raw.substring(0, sep)), raw.substring(sep + 1));
            } catch (RuntimeException e) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_CURSOR", "cursor 형식이 올바르지 않습니다");
            }
        }
    }
}
