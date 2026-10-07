package com.calendar.repository;

import com.calendar.entity.Note;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;

public interface NoteRepository extends JpaRepository<Note, String> {

    /** 첫 페이지: since 이후(경계 포함 — 중복은 클라이언트에서 멱등 처리) 변경분. */
    @Query("""
            select n from Note n
            where n.userId = :userId and n.updatedAt >= :since
            order by n.updatedAt asc, n.id asc
            """)
    List<Note> findFirstPage(String userId, Instant since, Pageable pageable);

    /** 다음 페이지: (updatedAt, id) 복합 커서 이후. */
    @Query("""
            select n from Note n
            where n.userId = :userId
              and (n.updatedAt > :cursorTime or (n.updatedAt = :cursorTime and n.id > :cursorId))
            order by n.updatedAt asc, n.id asc
            """)
    List<Note> findAfterCursor(String userId, Instant cursorTime, String cursorId, Pageable pageable);
}
