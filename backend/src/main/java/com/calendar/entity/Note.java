package com.calendar.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;

/**
 * 읽기 전용 엔티티. 쓰기는 NoteUpsertRepository의 원자적 upsert로만 수행한다
 * (updated_at은 서버가 UTC_TIMESTAMP(6)로 발급).
 */
@Entity
@Table(name = "notes")
public class Note {

    @Id
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(length = 36, nullable = false, updatable = false, insertable = false)
    private String id;

    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "user_id", length = 36, nullable = false, updatable = false, insertable = false)
    private String userId;

    @Column(name = "date", nullable = false, updatable = false, insertable = false)
    private LocalDate date;

    @Column(nullable = false, updatable = false, insertable = false, columnDefinition = "TEXT")
    private String content;

    @Column(nullable = false, updatable = false, insertable = false)
    private String color;

    @Column(nullable = false, updatable = false, insertable = false)
    private boolean deleted;

    @Column(name = "deleted_version", nullable = false, updatable = false, insertable = false)
    private int deletedVersion;

    @Column(name = "updated_at", nullable = false, updatable = false, insertable = false)
    private Instant updatedAt;

    protected Note() {
    }

    public String getId() {
        return id;
    }

    public String getUserId() {
        return userId;
    }

    public LocalDate getDate() {
        return date;
    }

    public String getContent() {
        return content;
    }

    public String getColor() {
        return color;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public int getDeletedVersion() {
        return deletedVersion;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
