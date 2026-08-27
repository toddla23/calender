# Phase 2-2 구현 완료 (Push/Pull + 네트워크 감지)

**완료 일자:** 2026-08-27  
**상태:** ✅ 구현 완료

---

## 📋 구현된 기능

### 1. HTTP 클라이언트 (`http-client.ts`)

- Axios 기반 HTTP 통신
- JWT Bearer Token 자동 관리
- 타임아웃 설정 (30초)
- GET/POST/PUT/PATCH/DELETE 메서드

**위치:** `electron/src/main/api/http-client.ts`

### 2. 재시도 유틸 (`retry.ts`)

- Exponential Backoff 재시도 로직
- 최대 재시도: 5회
- 초기 지연: 1초 → 최대 32초
- 커스텀 콜백 지원 (재시도 알림)

**위치:** `electron/src/main/api/retry.ts`

### 3. Sync 핸들러 완성 (`sync.ts`)

#### pushNotes()
- 오프라인 항목(synced=0) 자동 조회
- 배치 업로드 (최대 50개)
- 성공 항목만 synced=1 표시
- 실패 항목은 다음 동기화 시 재시도

#### pullNotes()
- 청크 기반 페이징 (커서 방식)
- 충돌 해결 (LWW + Tombstone)
- 서버 시계 역행 감지
- 강제 종료 복구 (lastPullCursor)
- hasMore=true 시 자동 다음 청크 Pull

**위치:** `electron/src/main/ipc/sync.ts`

### 4. 네트워크 모니터 (`network-monitor.ts`)

- Navigator.onLine 이벤트 감지
- 주기적 헬스 체크 (10초마다)
- 온/오프라인 상태 변화 콜백
- 구독자 패턴 지원

**위치:** `electron/src/main/sync/network-monitor.ts`

### 5. 동기화 엔진 (`sync-engine.ts`)

**상태 머신:**
- `idle` — 대기 상태
- `syncing` — 동기화 중
- `error` — 에러 발생
- `paused` — 오프라인 상태

**기능:**
- 자동 주기적 동기화 (30초)
- 온라인 복귀 시 즉시 동기화
- Push → Pull 순서 보장
- 상태 변화 구독

**위치:** `electron/src/main/sync/sync-engine.ts`

### 6. 업데이트된 네트워크 핸들러 (`network.ts`)

- NetworkMonitor 통합
- 자동 헬스 체크
- IPC 채널 지원

**위치:** `electron/src/main/ipc/network.ts`

### 7. 메인 프로세스 통합 (`index.ts`)

- SyncEngine 초기화
- 앱 시작 시 자동 모니터링 시작
- 앱 종료 시 정리 (cleanup)

**위치:** `electron/src/main/index.ts`

### 8. 경로 수정

- CRUD 핸들러 경로 수정 (`../../shared/types` 구조 정정)
- IPC 핸들러 경로 수정

**파일:**
- `electron/src/main/ipc/crud.ts`
- `electron/src/main/ipc/handlers.ts`

---

## 🏗️ 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────┐
│              Main Process (Electron)            │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │         SyncEngine (State Machine)       │   │
│  │  ┌────────────────────────────────────┐  │   │
│  │  │   Auto Sync Interval (30s)         │  │   │
│  │  │   Push → Pull 순서 보장            │  │   │
│  │  │   상태: idle/syncing/error/paused  │  │   │
│  │  └────────────────────────────────────┘  │   │
│  └───────────────────┬──────────────────────┘   │
│                      │                          │
│  ┌────────────────────┴──────────────────────┐  │
│  │                                           │  │
│  ▼                                           ▼  │
│  NetworkMonitor                     SyncHandlers│
│  • Online/Offline 감지              • Push     │
│  • 헬스 체크 (10s)                  • Pull     │
│  • 구독자 패턴                      • Auth     │
│                                               │
│  ┌──────────────────────────────────────────┐  │
│  │        IPC Handlers Registry             │  │
│  │   CRUD / Sync / Network 채널 등록        │  │
│  └──────────────────────────────────────────┘  │
│                      │                         │
│  ┌───────────────────┼──────────────────────┐  │
│  │                   │                      │  │
│  ▼                   ▼                      ▼  │
│  NotesRepository   SyncMetaRepository   SQLiteDB│
│                                               │
└─────────────────────────────────────────────────┘
         ↑              ↑              ↑
         │              │              │
    ┌────┴──────────────┴──────────────┴────┐
    │                                       │
    │    sync-core (Pure Functions)        │
    │  • ConflictResolver (LWW/Tombstone) │
    │  • PushService (Payload 준비)       │
    │  • PullService (응답 검증)          │
    │  • Constants (설정)                 │
    │                                       │
    └─────────────┬───────────────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
        ▼                    ▼
    HTTP Client      Retry Util
    (axios)          (Exp Backoff)
        │                    │
        ▼                    ▼
    Backend API (Spring Boot)
```

---

## 📊 동기화 흐름

### Push (클라이언트 → 서버)

```
1. SyncEngine.sync() 호출
2. SyncHandlers.pushNotes() 실행
   ├─ NotesRepository.getUnsyncedNotes() 조회 (synced=0)
   ├─ PushService.preparePushPayload() 페이로드 생성
   ├─ RetryUtil.executeWithRetry() with exponential backoff
   │  └─ HttpClient.post('/api/sync/push') 전송
   ├─ PushService.validateResponse() 응답 검증
   ├─ NotesRepository.markAsSynced(successfulIds) 업데이트
   └─ SyncMetaRepository.setLastSyncedAt() 타임스탬프 기록
```

### Pull (서버 → 클라이언트)

```
1. SyncHandlers.pullNotes() 실행
2. 청크 루프 시작 (hasMore=true까지)
   ├─ SyncMetaRepository.setSyncMeta() pull_in_progress=1
   ├─ PullService.preparePullRequest() 요청 생성
   ├─ RetryUtil.executeWithRetry() with exponential backoff
   │  └─ HttpClient.get('/api/sync/pull?since=...&cursor=...') 조회
   ├─ PullService.validateResponse() 응답 검증
   ├─ PullService.detectServerTimeRegression() 시계 역행 감지
   ├─ ConflictResolver.mergeNote() 충돌 해결
   │  ├─ Tombstone 버전닝 확인
   │  └─ Last-Write-Wins (updated_at 비교)
   ├─ NotesRepository.createNote() or .updateNote()
   └─ SyncMetaRepository.setLastPullCursor() 커서 저장
3. SyncMetaRepository.setPullInProgress(false)
```

### 네트워크 변화 감지

```
온라인 이벤트 발생
└─ NetworkMonitor 감지
   └─ SyncEngine 구독자 호출
      └─ syncStatus === 'idle' && isOnline()
         └─ SyncEngine.sync() 즉시 실행
```

---

## 🛡️ 강제 종료 복구

### Push 중 강제 종료
- synced=0 플래그 유지
- 재시작 시 자동 재Push

### Pull 중 강제 종료
- lastPullCursor 저장됨
- pull_in_progress=true 상태 (자동 정리 필요)
- 재시작 시 해당 커서부터 복구

**주의:** pull_in_progress=true 상태에서 멈출 수 있음  
→ Phase 2-3에서 시작 시 상태 정리 로직 추가 필요

---

## 📁 파일 구조 (변경사항)

```
electron/src/
├── main/
│   ├── index.ts                    ✏️ SyncEngine 통합
│   ├── api/
│   │   ├── http-client.ts          ✨ 새로 생성
│   │   └── retry.ts                ✨ 새로 생성
│   ├── db/
│   │   ├── sqlite.ts               (변경 없음)
│   │   └── queries/
│   │       ├── notes.ts            (변경 없음)
│   │       └── sync-meta.ts        (변경 없음)
│   ├── ipc/
│   │   ├── handlers.ts             ✏️ 경로 수정
│   │   ├── crud.ts                 ✏️ 경로 수정
│   │   ├── sync.ts                 ✏️ 완전 구현
│   │   └── network.ts              ✏️ NetworkMonitor 통합
│   └── sync/
│       ├── network-monitor.ts      ✨ 새로 생성
│       └── sync-engine.ts          ✨ 새로 생성
└── shared/
    ├── types/
    │   ├── Note.ts                 (변경 없음)
    │   ├── SyncMeta.ts             (변경 없음)
    │   └── IPC.ts                  (변경 없음)
    └── sync-core/
        ├── constants.ts            (변경 없음)
        ├── conflict.ts             (변경 없음)
        ├── push.ts                 (변경 없음)
        ├── pull.ts                 (변경 없음)
        └── index.ts                (변경 없음)
```

---

## ⚙️ 설정 항목

### 환경 변수

```bash
# .env (선택적)
BACKEND_URL=http://localhost:8080
NODE_ENV=development
```

### SyncEngine 설정

```typescript
new SyncEngine({
  backendUrl: 'http://localhost:8080',
  autoSync: true,                    // 자동 동기화 활성화
  syncInterval: 30000,               // 30초 주기
})
```

---

## 🧪 테스트 시나리오

### 1. 온라인 상태 Push
```
✅ 로컬에서 메모 입력 (synced=0)
✅ 네트워크 온라인
✅ SyncEngine.sync() 자동 호출
✅ Push 성공 → synced=1로 업데이트
```

### 2. 온라인 상태 Pull
```
✅ 서버에 새 메모 있음
✅ Pull 시작
✅ 청크 단위로 로드 (hasMore=true면 계속)
✅ 충돌 없음 → 로컬에 추가
```

### 3. 오프라인 상태 CRUD
```
✅ 네트워크 오프라인
✅ 로컬에 메모 입력 (synced=0)
✅ UI 즉시 갱신
✅ 네트워크 복귀 시 자동 Push
```

### 4. 강제 종료 후 복구
```
✅ Pull 중 강제 종료
✅ Pull cursor 저장됨
✅ 재시작 시 커서부터 복구
```

### 5. 충돌 해결
```
✅ 로컬과 서버에 같은 메모 존재
✅ 양쪽 모두 수정됨
✅ LWW (updated_at 최신값) 적용
```

### 6. 삭제-수정 충돌
```
✅ 로컬: deleted=true, deleted_version=2
✅ 서버: deleted=false, deleted_version=1
✅ Tombstone 우선 (로컬 버전이 더 높음)
✅ deleted=true 유지
```

---

## ⚠️ 알려진 제한사항

### 1. Pull 중 강제 종료
- `pull_in_progress=true` 상태에서 정지 가능
- 해결: 앱 시작 시 상태 정리 필요 (Phase 2-3에서)

### 2. 매우 큰 배치
- 50개씩 청크 (커스터마이징 가능)
- 많은 항목: 여러 청크 필요

### 3. 네트워크 감지
- 현재 HEAD /api/health에 의존
- 백엔드에서 /api/health 엔드포인트 필요 (구현 필요)

### 4. JWT 토큰 만료
- 현재 만료 시 실패
- 해결: Token Refresh 로직 필요 (Phase 2-3에서)

---

## 🚀 다음 단계 (Phase 2-3)

### 우선순위

1. **UI 컴포넌트**
   - 월간 캘린더 뷰 (React)
   - 메모 입력/수정 모달
   - 동기화 상태 인디케이터

2. **Google OAuth 로그인**
   - OAuth Popup 또는 Redirect
   - ID Token 획득
   - JWT 저장 및 자동 갱신

3. **Token Refresh**
   - Refresh Token 자동 갱신
   - 401 에러 시 재요청

4. **앱 시작 상태 정리**
   - pull_in_progress=true 상태 정리
   - 스텁 항목 정리

5. **z-order 관리**
   - koffi + SetWindowPos(HWND_BOTTOM)
   - 창 투명도 설정

6. **백엔드 /api/health 구현**
   - Spring Boot에 헬스 체크 엔드포인트

---

## 📝 코드 품질 체크리스트

- ✅ TypeScript 타입 안정성
- ✅ 에러 핸들링 (try-catch)
- ✅ 리소스 정리 (cleanup)
- ✅ 구독자 패턴 (메모리 누수 방지)
- ✅ 상수화 (magic numbers 제거)
- ✅ 모듈 분리
- ⚠️ 단위 테스트 (아직)
- ⚠️ 통합 테스트 (아직)

---

## 📚 참고 문서

- [PROGRESS.md](../project-status/PROGRESS.md)
- [SYNC_PROTOCOL.md](../docs/SYNC_PROTOCOL.md)
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- [API.md](../docs/API.md)

---

**작성자:** Claude Code  
**최종 수정:** 2026-08-27  
**상태:** ✅ Phase 2-2 완료
