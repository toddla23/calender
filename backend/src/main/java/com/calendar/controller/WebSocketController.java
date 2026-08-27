package com.calendar.controller;

import com.calendar.dto.WebSocketMessage;
import com.calendar.dto.NoteDto;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.messaging.simp.annotation.SubscribeMapping;
import org.springframework.stereotype.Controller;
import java.time.Instant;

@Controller
public class WebSocketController {

  private final SimpMessagingTemplate messagingTemplate;

  public WebSocketController(SimpMessagingTemplate messagingTemplate) {
    this.messagingTemplate = messagingTemplate;
  }

  @MessageMapping("/ping")
  @SendTo("/topic/pong")
  public WebSocketMessage handlePing(WebSocketMessage message) {
    return WebSocketMessage.builder()
        .type("pong")
        .timestamp(Instant.now().toString())
        .data("pong")
        .build();
  }

  @SubscribeMapping("/topic/sync")
  public WebSocketMessage onSubscribeSyncTopic() {
    return WebSocketMessage.builder()
        .type("connected")
        .timestamp(Instant.now().toString())
        .data("Successfully connected to sync topic")
        .build();
  }

  // 서버에서 특정 사용자에게 메시지 전송 (외부 서비스에서 호출)
  public void broadcastNoteUpdate(String userId, NoteDto note) {
    WebSocketMessage message = WebSocketMessage.builder()
        .type("note_updated")
        .userId(userId)
        .timestamp(Instant.now().toString())
        .data(note)
        .build();

    messagingTemplate.convertAndSendToUser(userId, "/topic/sync", message);
  }

  public void broadcastNoteCreated(String userId, NoteDto note) {
    WebSocketMessage message = WebSocketMessage.builder()
        .type("note_created")
        .userId(userId)
        .timestamp(Instant.now().toString())
        .data(note)
        .build();

    messagingTemplate.convertAndSendToUser(userId, "/topic/sync", message);
  }

  public void broadcastNoteDeleted(String userId, String noteId) {
    WebSocketMessage message = WebSocketMessage.builder()
        .type("note_deleted")
        .userId(userId)
        .timestamp(Instant.now().toString())
        .data(noteId)
        .build();

    messagingTemplate.convertAndSendToUser(userId, "/topic/sync", message);
  }
}
