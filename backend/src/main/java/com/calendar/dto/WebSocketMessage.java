package com.calendar.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebSocketMessage {
  private String type; // "note_created", "note_updated", "note_deleted", "sync_started", etc.
  private String userId;
  private String timestamp;
  private Object data;
}
