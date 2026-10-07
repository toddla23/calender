package com.calendar.controller;

import com.calendar.dto.Dtos.PullResponse;
import com.calendar.dto.Dtos.PushItem;
import com.calendar.dto.Dtos.PushResult;
import com.calendar.service.SyncService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.validation.annotation.Validated;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

@Validated
@RestController
@RequestMapping("/api/sync")
public class SyncController {

    private final SyncService sync;

    public SyncController(SyncService sync) {
        this.sync = sync;
    }

    @GetMapping("/pull")
    public PullResponse pull(Authentication auth,
                             @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant since,
                             @RequestParam(required = false) String cursor,
                             @RequestParam(required = false) Integer limit) {
        return sync.pull(auth.getName(), since, cursor, limit);
    }

    /**
     * 요청 본문은 [{id,date,content,color,deleted,deleted_version}, ...] (최대 500건). origin 식별자(기기 ID + 커넥션 ID)는 헤더로 받아
     * broadcast 메시지에 실어 보낸다 (에코 루프 방지).
     */
    @PostMapping("/push")
    public List<PushResult> push(Authentication auth,
                                 @RequestBody @NotNull @Size(max = 500) List<@Valid PushItem> items,
                                 @RequestHeader(value = "X-Device-Id", required = false) String deviceId,
                                 @RequestHeader(value = "X-Connection-Id", required = false) String connectionId) {
        return sync.push(auth.getName(), items, deviceId, connectionId);
    }
}
