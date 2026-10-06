package com.calendar.repository;

import com.calendar.entity.Note;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.UUID;

@Repository
public interface NoteRepository extends JpaRepository<Note, UUID> {
    Page<Note> findByUserIdAndUpdatedAtGreaterThanEqualOrderByUpdatedAtAscIdAsc(
        UUID userId,
        Instant since,
        Pageable pageable
    );

    @Query(nativeQuery = true, value = """
        SELECT * FROM notes
        WHERE user_id = :userId
          AND updated_at >= :since
          AND id > :cursor
        ORDER BY updated_at ASC, id ASC
        LIMIT :limit
        """)
    Page<Note> findByUserIdAndUpdatedAtGreaterThanAndIdGreaterThanOrderByUpdatedAtAscIdAsc(
        @Param("userId") UUID userId,
        @Param("since") Instant since,
        @Param("cursor") UUID cursor,
        @Param("limit") int limit,
        Pageable pageable
    );

    @Modifying
    @Query(nativeQuery = true, value = """
        INSERT INTO notes (id, user_id, date, content, color, deleted, deleted_version, updated_at)
        VALUES (:id, :userId, :date, :content, :color, :deleted, :deletedVersion, NOW())
        ON CONFLICT (id)
        DO UPDATE SET
            content = EXCLUDED.content,
            color = EXCLUDED.color,
            deleted = EXCLUDED.deleted,
            deleted_version = CASE
                WHEN EXCLUDED.deleted = true AND notes.deleted = false
                    THEN notes.deleted_version + 1
                WHEN EXCLUDED.deleted = false AND notes.deleted = true
                    THEN EXCLUDED.deleted_version
                ELSE notes.deleted_version
            END,
            updated_at = NOW()
        WHERE notes.updated_at < NOW()
        """)
    void upsertNote(
        @Param("id") UUID id,
        @Param("userId") UUID userId,
        @Param("date") java.time.LocalDate date,
        @Param("content") String content,
        @Param("color") String color,
        @Param("deleted") Boolean deleted,
        @Param("deletedVersion") Integer deletedVersion
    );
}
