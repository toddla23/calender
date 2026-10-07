package com.calendar.repository;

import com.calendar.dto.Dtos.PushItem;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.Date;
import java.time.Instant;

/**
 * 충돌 해결을 하나의 원자적 SQL로 처리한다 (읽기→비교→쓰기 분리 시 레이스 컨디션 발생).
 * <ul>
 *   <li>updated_at은 클라이언트가 아닌 서버(UTC_TIMESTAMP(6))가 발급 → 클라이언트 시계 오차 배제</li>
 *   <li>다른 사용자의 노트 id와 충돌하면 어떤 컬럼도 바꾸지 않는다</li>
 *   <li>tombstone(deleted=1)을 되살리는 쓰기는 클라이언트가 본 deleted_version이
 *       서버 값 이상일 때만 허용 → 삭제를 모르는 기기의 오래된 수정이 부활시키지 못한다</li>
 *   <li>삭제 전이(0→1) 시 deleted_version 증가, 복구는 버전을 유지</li>
 * </ul>
 * MariaDB는 ON DUPLICATE KEY UPDATE의 대입을 왼쪽에서 오른쪽으로 평가하며 앞선 대입 결과를 뒤에서 참조한다.
 * 조건식 APPLY가 참조하는 user_id/deleted/deleted_version은 deleted_version → deleted 순으로 마지막에 갱신한다.
 */
@Repository
public class NoteUpsertRepository {

    private static final String APPLY = """
            (user_id = VALUES(user_id)
             AND NOT (deleted = 1 AND VALUES(deleted) = 0 AND VALUES(deleted_version) < deleted_version))""";

    private static final String UPSERT = """
            INSERT INTO notes (id, user_id, `date`, content, color, deleted, deleted_version, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6))
            ON DUPLICATE KEY UPDATE
              `date`          = IF(%1$s, VALUES(`date`), `date`),
              content         = IF(%1$s, VALUES(content), content),
              color           = IF(%1$s, VALUES(color), color),
              updated_at      = IF(%1$s, UTC_TIMESTAMP(6), updated_at),
              deleted_version = IF(%1$s AND deleted = 0 AND VALUES(deleted) = 1, deleted_version + 1, deleted_version),
              deleted         = IF(%1$s, VALUES(deleted), deleted)
            """.formatted(APPLY);

    private final JdbcTemplate jdbc;

    public NoteUpsertRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void upsert(String userId, PushItem item) {
        jdbc.update(UPSERT,
                item.id().toLowerCase(),
                userId,
                Date.valueOf(item.date()),
                item.content(),
                item.color() == null ? "" : item.color(),
                item.deleted() ? 1 : 0,
                item.deletedVersion());
    }

    /** 서버(DB) 기준 현재 UTC 시각. updated_at과 같은 시계를 쓰기 위해 DB에서 가져온다. */
    public Instant dbNow() {
        String s = jdbc.queryForObject(
                "SELECT DATE_FORMAT(UTC_TIMESTAMP(6), '%Y-%m-%dT%H:%i:%s.%fZ')", String.class);
        return Instant.parse(s);
    }
}
