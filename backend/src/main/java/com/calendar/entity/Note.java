package com.calendar.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "notes", indexes = {
    @Index(name = "idx_notes_user_id_date", columnList = "user_id,date"),
    @Index(name = "idx_notes_user_id_updated_at", columnList = "user_id,updated_at"),
    @Index(name = "idx_notes_deleted", columnList = "deleted")
})
@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Note {
    @Id
    @Column(columnDefinition = "UUID")
    private UUID id;

    @Column(name = "user_id", nullable = false, columnDefinition = "UUID")
    private UUID userId;

    @Column(nullable = false)
    private LocalDate date;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    private String color;

    @Column(nullable = false)
    private Boolean deleted = false;

    @Column(name = "deleted_version", nullable = false)
    private Integer deletedVersion = 0;

    @Column(name = "updated_at", nullable = false, columnDefinition = "TIMESTAMP WITH TIME ZONE")
    private Instant updatedAt;

    @Column(name = "created_at", nullable = false, columnDefinition = "TIMESTAMP WITH TIME ZONE")
    private Instant createdAt;

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        if (createdAt == null) {
            createdAt = now;
        }
        if (updatedAt == null) {
            updatedAt = now;
        }
        if (deleted == null) {
            deleted = false;
        }
        if (deletedVersion == null) {
            deletedVersion = 0;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
