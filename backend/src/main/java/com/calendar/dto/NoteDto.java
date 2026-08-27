package com.calendar.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.calendar.entity.Note;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NoteDto {
    private UUID id;
    private LocalDate date;

    @NotBlank(message = "Content is required")
    private String content;

    private String color;

    @NotNull(message = "Deleted flag is required")
    private Boolean deleted;

    @JsonProperty("deleted_version")
    private Integer deletedVersion;

    @JsonProperty("updated_at")
    private Instant updatedAt;

    public static NoteDto fromEntity(Note note) {
        return NoteDto.builder()
            .id(note.getId())
            .date(note.getDate())
            .content(note.getContent())
            .color(note.getColor())
            .deleted(note.getDeleted())
            .deletedVersion(note.getDeletedVersion())
            .updatedAt(note.getUpdatedAt())
            .build();
    }

    public Note toEntity(UUID userId) {
        return Note.builder()
            .id(this.id != null ? this.id : UUID.randomUUID())
            .userId(userId)
            .date(this.date)
            .content(this.content)
            .color(this.color)
            .deleted(this.deleted != null ? this.deleted : false)
            .deletedVersion(this.deletedVersion != null ? this.deletedVersion : 0)
            .updatedAt(Instant.now())
            .build();
    }
}
