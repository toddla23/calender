# Phase 2: Electron 클라이언트 구현 계획

**목표:** 오프라인/온라인 동기화를 지원하는 Windows 위젯 형태의 Electron 데스크톱 캘린더 구현  
**기간:** 4주 (Week 1~4)  
**선행 조건:** Phase 1 백엔드(Spring Boot + PostgreSQL) 완성

---

## 1. Electron 프로젝트 구조

```
electron-calendar/
├── src/
│   ├── main/
│   │   ├── index.ts                    # Main process 진입점
│   │   ├── app.ts                      # Electron app 라이프사이클 관리
│   │   ├── window.ts                   # BrowserWindow 생성/z-order 관리
│   │   ├── db/
│   │   │   ├── sqlite.ts               # SQLite 연결 및 초기화
│   │   │   ├── migrations/
│   │   │   │   ├── 001_init_schema.sql # 초기 스키마 (notes + sync_meta)
│   │   │   │   └── 002_add_indices.sql # 성능 인덱스
│   │   │   └── queries/
│   │   │       ├── notes.ts            # notes 테이블 CRUD 쿼리
│   │   │       └── sync-meta.ts        # sync_meta 테이블 쿼리
│   │   ├── ipc/
│   │   │   ├── handlers.ts             # IPC 메시지 핸들러 등록
│   │   │   ├── crud.ts                 # CRUD 관련 IPC (create, read, update, delete)
│   │   │   ├── sync.ts                 # 동기화 관련 IPC (push, pull, status)
│   │   │   └── network.ts              # 네트워크 상태 IPC
│   │   └── sync/
│   │       ├── sync-engine.ts          # 동기화 엔진 (Push/Pull 조율)
│   │       ├── push-handler.ts         # Push 로직 (synced=0 → 서버)
│   │       ├── pull-handler.ts         # Pull 로직 (서버 → 로컬, 청크/커서)
│   │       ├── network-monitor.ts      # 온라인/오프라인 감지 + ping 관리
│   │       ├── retry-queue.ts          # 실패 항목 exponential backoff 재시도
│   │       └── conflict-resolver.ts    # 충돌 해결 (updatedAt 기반 LWW)
│   ├── renderer/
│   │   ├── index.html                  # 진입 HTML
│   │   ├── App.tsx                     # React 루트 컴포넌트
│   │   ├── pages/
│   │   │   ├── LoginPage.tsx           # Google OAuth 로그인
│   │   │   ├── CalendarPage.tsx        # 메인 캘린더 UI
│   │   │   └── SettingsPage.tsx        # 설정 (로그아웃 등)
│   │   ├── components/
│   │   │   ├── Calendar/
│   │   │   │   ├── MonthView.tsx       # 월간 캘린더 뷰
│   │   │   │   ├── DayCell.tsx         # 각 날짜 셀
│   │   │   │   └── NoteModal.tsx       # 메모 입력 모달
│   │   │   └── Sync/
│   │   │       ├── SyncStatus.tsx      # 동기화 상태 표시
│   │   │       └── OfflineIndicator.tsx# 오프라인 배너
│   │   ├── hooks/
│   │   │   ├── useSyncStatus.ts        # 동기화 상태 구독
│   │   │   ├── useNetworkStatus.ts     # 네트워크 상태 구독
│   │   │   ├── useLocalNotes.ts        # 로컬 DB 데이터 구독
│   │   │   └── useAuth.ts              # 로그인 상태 관리
│   │   ├── services/
│   │   │   ├── ipc-client.ts           # IPC 호출 래퍼
│   │   │   └── api-client.ts           # 백엔드 HTTP 클라이언트
│   │   └── styles/
│   │       └── global.css
│   └── shared/
│       ├── types/
│       │   ├── Note.ts                 # Note 인터페이스
│       │   ├── SyncMeta.ts             # SyncMeta 인터페이스
│       │   └── IPC.ts                  # IPC 메시지 타입 정의
│       └── sync-core/
│           ├── index.ts                # 공유 동기화 로직 진입점
│           ├── push.ts                 # Push 로직 (순수 함수)
│           ├── pull.ts                 # Pull 로직 (순수 함수)
│           ├── conflict.ts             # 충돌 해결 (순수 함수)
│           └── constants.ts            # 상수 (CHUNK_SIZE, RETRY_TIMES 등)
├── package.json
├── tsconfig.json
├── webpack.config.js
└── .env.example

```

---

## 2. SQLite 로컬 DB 스키마 설계

### 2-1. `notes` 테이블

| 필드명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | TEXT | PRIMARY KEY, NOT NULL | UUID (클라이언트에서 생성) |
| date | TEXT | NOT NULL | LocalDate 형식 (YYYY-MM-DD) |
| content | TEXT | | 메모 내용 |
| color | TEXT | | 색상 코드 (#RRGGBB) |
| deleted | INTEGER (0/1) | NOT NULL, DEFAULT 0 | 소프트 삭제 여부 |
| deleted_version | INTEGER | NOT NULL, DEFAULT 0 | Tombstone 버전닝 |
| updated_at | TEXT | NOT NULL | ISO 8601 UTC 타임스탬프 (Z 포함) |
| synced | INTEGER (0/1) | NOT NULL, DEFAULT 0 | 0=로컬 변경, 1=서버 반영 완료 |
| created_at | TEXT | NOT NULL | 항목 생성 시각 (로컬 기록용) |

**인덱스:**
```sql
CREATE INDEX idx_notes_date ON notes(date);
CREATE INDEX idx_notes_synced ON notes(synced);
CREATE INDEX idx_notes_updated_at ON notes(updated_at);
```

### 2-2. `sync_meta` 테이블

| 필드명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | INTEGER | PRIMARY KEY | 항상 1 (싱글톤) |
| last_synced_at | TEXT | | 마지막 성공한 Pull의 serverTime |
| last_pull_cursor | TEXT | | 마지막으로 받은 항목 ID (다음 Pull 시작점) |
| pull_in_progress | INTEGER (0/1) | DEFAULT 0 | Pull 중 강제 종료 대비 플래그 |
| push_in_progress | INTEGER (0/1) | DEFAULT 0 | Push 중 강제 종료 대비 플래그 |
| last_push_time | TEXT | | 마지막 Push 시도 시간 |
| user_id | TEXT | | 로그인한 사용자 ID (로그아웃 시 clear) |
| access_token | TEXT | | JWT Access Token |
| refresh_token | TEXT | | JWT Refresh Token |
| token_expires_at | TEXT | | Access Token 만료 시각 |

**참고:** 로그아웃 시 `notes` 테이블 완전 초기화 + `sync_meta` 초기화

### 2-3. 저장 위치

- **Windows:** `%APPDATA%/electron-calendar/data.db`
- **개발:** `./data/dev.db` (npm run dev 시)

---

## 3. 오프라인 CRUD 구현 순서

### 3-1. CREATE (메모 추가)

**플로우:**
1. 사용자 입력 (날짜, 내용, 색상)
2. 클라이언트가 UUID 생성 (오프라인 생성 가능)
3. 로컬 DB에 즉시 INSERT: `synced=0, updated_at=지금`
4. UI 즉시 갱신 (로컬 DB 기준)
5. 온라인이면: 백그라운드로 Push 시도

**IPC 메시지:**
```typescript
// Renderer → Main
'note:create' => { date: string, content: string, color: string }
// Response
{ id: string, success: boolean }
```

### 3-2. READ (메모 조회)

**플로우:**
1. Renderer가 특정 날짜 또는 범위 조회 요청
2. Main이 로컬 DB에서 조회 (deleted=0인 항목만)
3. 날짜별 그룹핑해서 반환

**IPC 메시지:**
```typescript
// Renderer → Main
'notes:list' => { startDate: string, endDate: string }
// Response
{ items: Note[] }
```

### 3-3. UPDATE (메모 수정)

**플로우:**
1. 사용자가 메모 수정 (내용/색상)
2. 로컬 DB UPDATE: `synced=0, updated_at=지금`
3. UI 즉시 갱신
4. 온라인이면: 백그라운드로 Push 시도

**IPC 메시지:**
```typescript
// Renderer → Main
'note:update' => { id: string, content: string, color: string }
// Response
{ success: boolean }
```

### 3-4. DELETE (메모 삭제)

**플로우:**
1. 사용자가 삭제 버튼 클릭
2. 로컬 DB UPDATE: `deleted=true, deleted_version++, synced=0, updated_at=지금`
3. UI에서 삭제된 항목 숨김 (또는 "복구" 버튼 표시)
4. 온라인이면: 백그라운드로 Push 시도

**IPC 메시지:**
```typescript
// Renderer → Main
'note:delete' => { id: string }
// Response
{ success: boolean }
```

### 3-5. 동기화 상태 플래그 (`synced`)

| synced | 의미 | 동작 |
|--------|------|------|
| 0 | 로컬 변경, 서버 미반영 | Push 큐에 포함, Pull 응답 받아도 무시 (로컬이 최신) |
| 1 | 서버 반영 완료 | Pull 응답 받으면 `updated_at` 비교 후 갱신 |

**충돌 해결:** Pull 응답에서 받은 `updated_at`과 로컬 `updated_at` 비교 → 서버 값이 더 최신이면 덮어씌움

---

## 4. sync-core 공유 라이브러리 (순수 함수 기반)

### 목표
Electron과 React Native 모두 사용 가능한 **프레임워크 독립적**인 동기화 로직

### 4-1. 모듈 구성

#### `sync-core/push.ts`
```
exportFunction preparePushPayload(
  localNotes: Note[],
  => returns: { id, date, content, color, deleted, deleted_version }[]
)

exportFunction validatePushResponse(
  response: PushResponse,
  localNotes: Note[],
  => returns: Map<noteId, { success, error? }>
)

exportFunction markAsSynced(
  noteIds: string[],
  => returns: SQL UPDATE 쿼리 또는 업데이트 객체
)
```

#### `sync-core/pull.ts`
```
exportFunction preparePullRequest(
  lastSyncedAt: string | null,
  lastPullCursor: string | null,
  => returns: { since, cursor, limit }
)

exportFunction mergePullResponse(
  items: ServerNote[],
  localNotes: Map<id, Note>,
  => returns: Map<id, MergedNote>  // updatedAt 비교로 최신 선택
)

exportFunction updateSyncMeta(
  response: PullResponse,
  hasMore: boolean,
  => returns: SyncMeta (updated)
)
```

#### `sync-core/conflict.ts`
```
exportFunction resolveConflict(
  localNote: Note,
  serverNote: ServerNote,
  => returns: Note  // updatedAt 기준 LWW
)

exportFunction validateDeletedVersion(
  localNote: Note,
  serverNote: ServerNote,
  => returns: boolean  // 의미적 충돌 없는지 검증
)
```

#### `sync-core/constants.ts`
```typescript
export const CHUNK_SIZE = 50;
export const MAX_RETRIES = 3;
export const RETRY_BACKOFF_MS = 1000; // 1s, 2s, 4s 등
export const NETWORK_TIMEOUT_MS = 10000;
export const SYNC_INTERVAL_MS = 30000; // 30s (자동 주기 동기화)
```

### 4-2. 사용 예시 (Main Process에서)

```typescript
// Push 준비
const payload = preparePushPayload(notesWithSyncedFalse);

// API 호출 (Main Process 담당)
const response = await fetch('/api/sync/push', { body: payload });

// 응답 처리
const results = validatePushResponse(response, notesWithSyncedFalse);
const updateQueries = markAsSynced(successfulIds);

// Pull 준비
const pullReq = preparePullRequest(lastSyncedAt, lastPullCursor);
const pullRes = await fetch('/api/sync/pull', { params: pullReq });

// Pull 응답 병합 (충돌 자동 해결)
const merged = mergePullResponse(pullRes.items, localNotesMap);

// sync_meta 업데이트
const updatedMeta = updateSyncMeta(pullRes, pullRes.hasMore);
```

---

## 5. Electron ↔ 백엔드 동기화 구현

### 5-1. 네트워크 상태 감지 (`network-monitor.ts`)

**구현 전략:**

1. **`navigator.onLine` + 주기적 Ping**
   - Renderer에서 `navigator.onLine` 변화 감지
   - Main에서 백그라운드 ping(`HEAD /api/health`) 주기적 실행
   - 둘 다 오프라인 신호 → 동기화 중단

2. **신뢰성:**
   - `navigator.onLine`만 사용 금지 (불안정)
   - API 호출 실패 시 1초 대기 후 재시도 (exponential backoff)
   - 3회 연속 실패 → 오프라인 상태로 전환

3. **Event 발행:**
   ```typescript
   ipcMain.emit('network:online');    // 온라인 전환
   ipcMain.emit('network:offline');   // 오프라인 전환
   ```

### 5-2. 동기화 트리거

| 트리거 | 조건 | 동작 |
|--------|------|------|
| **온라인 전환** | 오프라인 → 온라인 감지 | Push → Pull 즉시 실행 |
| **정기 동기화** | 30초마다 | 온라인 상태면 Push → Pull 실행 |
| **사용자 수동** | "지금 동기화" 버튼 | Push → Pull 즉시 실행 |
| **앱 종료 전** | app.quit() | 진행 중인 Push/Pull 완료 대기 |

### 5-3. Sync Engine (`sync-engine.ts`)

**상태 머신:**

```
IDLE
  ↓ (온라인 전환 또는 타이머)
PUSHING (synced=0인 항목들 POST /api/sync/push)
  ├→ 성공: synced=1로 표시
  ├→ 부분 실패: 실패 항목을 retry_queue에 추가
  └→ 모두 실패: exponential backoff로 재시도 예약
  ↓
PULLING (GET /api/sync/pull?since=...&cursor=...&limit=50)
  ├→ 청크 수신: 로컬 DB에 병합, lastPullCursor 저장
  ├→ hasMore=false: lastSyncedAt 업데이트, IDLE로 복귀
  ├→ 네트워크 오류: pullInProgress=true 유지, 재시도 예약
  └→ 부분 수신 후 강제 종료: 재시작 시 lastPullCursor부터 재개
  ↓
IDLE
```

**구현 포인트:**

- Push/Pull은 직렬화 (동시 실행 금지)
- 각 상태 진입/탈출 시 IPC로 Renderer에 상태 공지
- 실패 항목은 `retry-queue.ts`에서 관리

### 5-4. Push 핸들러 (`push-handler.ts`)

```
1) synced=0인 항목 조회
2) 각 항목을 다음 형식으로 변환:
   { id, date, content, color, deleted, deleted_version }
3) POST /api/sync/push (배치 요청)
4) 응답 항목별 확인:
   - success=true → 로컬 DB에서 synced=1로 표시
   - success=false → retry_queue에 추가 (exponential backoff)
5) 모든 항목 처리 후 동기화 상태 저장
```

### 5-5. Pull 핸들러 (`pull-handler.ts`)

```
사전 조건:
  lastSyncedAt = null이면 처음부터 시작
  lastPullCursor != null이고 pullInProgress=true이면 복구 모드

루프:
  1) GET /api/sync/pull?since={lastSyncedAt}&cursor={lastPullCursor}&limit=50
  2) 응답 항목 병합 (sync-core/pull.ts의 mergePullResponse)
  3) lastPullCursor = response.nextCursor 저장
  4) response.hasMore=true이면 루프 계속
  5) response.hasMore=false이면:
     - lastSyncedAt = response.serverTime 저장
     - pullInProgress = false 저장
     - 완료

강제 종료 복구:
  - 재시작 시 pullInProgress=true && lastPullCursor != null 확인
  - 맞으면 마지막 cursor부터 다시 시작
```

### 5-6. Retry Queue (`retry-queue.ts`)

**구조:**
```typescript
class RetryQueue {
  private queue: Map<noteId, { note, retryCount, nextRetryTime }>;

  add(note: Note): void;
  getReadyToRetry(): Note[];
  markAsRetried(noteId: string): void;
  clear(): void; // 로그아웃 시
}
```

**백오프 계산:**
```
retryCount=0: 즉시 재시도
retryCount=1: 1초 후
retryCount=2: 2초 후
retryCount=3: 4초 후
maxRetries=3을 초과하면 사용자 경고
```

---

## 6. z-order 관리 (항상 맨 아래)

### 6-1. 구현 방식

**절대 금지:** `alwaysOnTop: true` (다른 앱 위젯들과 충돌)

**권장:** `SetWindowPos` (Windows API, koffi 사용)

### 6-2. 코드 패턴 (`window.ts`)

```typescript
import koffi from 'koffi';

const user32 = koffi.load('user32.dll');
const SetWindowPos = user32.func('SetWindowPos');
const GetForegroundWindow = user32.func('GetForegroundWindow');

const HWND_BOTTOM = 1;

function sendToBottom(hwnd: number) {
  SetWindowPos(hwnd, HWND_BOTTOM, 0, 0, 0, 0, 0x0001); // SWP_NOSIZE | SWP_NOMOVE
}

export function createWindow() {
  const win = new BrowserWindow({
    // ... 다른 설정
  });

  // 포커스 이탈 시 맨 아래로 내리기
  win.on('blur', () => {
    sendToBottom(win.getNativeWindowHandle().readUInt32LE(0));
  });

  return win;
}
```

### 6-3. 동작 시나리오

```
1. 앱 시작 → 창 생성 → SetWindowPos(HWND_BOTTOM)
2. 사용자 클릭 → 포커스 획득 → 정상 노출
3. 다른 앱 클릭 → 포커스 이탈 → blur 이벤트 → SetWindowPos(HWND_BOTTOM)
4. 사용자가 다시 클릭 → 포커스 획득 (자동으로 맨 위로 올라옴)
```

---

## 7. 개발 순서 (Week별)

### Week 1: 프로젝트 설정 + 로컬 DB

**목표:** Electron 프로젝트 셋업, SQLite 초기화, 기본 CRUD 동작 확인

**작업:**

1. **Electron 프로젝트 생성**
   - `electron-forge` 또는 `electron-builder` 사용
   - TypeScript 설정 (tsconfig.json, webpack)
   - ESLint + Prettier 설정

2. **SQLite 드라이버 통합**
   - `better-sqlite3` 또는 `sqlite3` npm 모듈 선택
   - Native 바인딩 설정 (Windows 미리컴파일 바이너리)

3. **DB 마이그레이션 시스템**
   - `migrations/001_init_schema.sql` 작성
   - Main process에서 자동 마이그레이션 스크립트 (초기 실행 또는 버전 업 시)

4. **기본 CRUD 구현**
   - IPC 핸들러 등록 (note:create, note:read, note:update, note:delete)
   - 각 쿼리 함수 구현 (INSERT, SELECT, UPDATE)
   - Renderer에서 테스트 (메모 추가 → 조회 → 수정 → 삭제)

5. **Simple Calendar UI**
   - React 기본 컴포넌트 (월간 뷰, 셀)
   - 메모 모달 (입력 폼)
   - 색상 선택 (기본 4-5개 색상)

**완료 기준:**
- 메모 추가/수정/삭제가 UI에 즉시 반영됨
- 앱 재시작 후 데이터 영속성 확인
- localStorage가 아닌 SQLite에 저장됨 확인

---

### Week 2: 네트워크 동기화 코어

**목표:** Push/Pull 로직 구현, 충돌 해결, 부분 실패 복구

**작업:**

1. **sync-core 라이브러리 완성**
   - push.ts: preparePushPayload, validatePushResponse, markAsSynced
   - pull.ts: preparePullRequest, mergePullResponse, updateSyncMeta
   - conflict.ts: resolveConflict, validateDeletedVersion
   - constants.ts: 상수 정의
   - **→ 단위 테스트 작성 (Jest 또는 Vitest)**

2. **API 클라이언트 구현**
   - `services/api-client.ts` (HTTP 호출 + JWT 토큰 관리)
   - `POST /api/sync/push`
   - `GET /api/sync/pull?since=...&cursor=...&limit=50`
   - Refresh token 자동 갱신 로직

3. **Push 핸들러**
   - synced=0 항목 조회 및 배치 전송
   - 응답 항목별 성공/실패 처리
   - 실패 항목을 retry_queue에 등록

4. **Pull 핸들러 + 청크/커서**
   - 첫 Pull 요청 (lastSyncedAt=null이면 전체)
   - 청크 수신 후 로컬 DB 병합
   - hasMore=false까지 루프
   - 강제 종료 시뮬레이션: lastPullCursor 복구 테스트

5. **Retry Queue**
   - 실패 항목 관리 (exponential backoff)
   - 최대 재시도 횟수 제한 (MAX_RETRIES=3)

**완료 기준:**
- Push/Pull 단위 테스트 통과 (가짜 서버 응답 모킹)
- 시뮬레이션된 네트워크 끊김 시 복구 확인
- synced 플래그 상태 추적 확인

---

### Week 3: 네트워크 상태 감지 + UI 연동

**목표:** 온라인/오프라인 전환 감지, 자동 동기화, 상태 표시

**작업:**

1. **네트워크 모니터 (`network-monitor.ts`)**
   - `navigator.onLine` 이벤트 감지 (Renderer)
   - Main에서 주기적 ping (HEAD /api/health)
   - 온라인/오프라인 상태 변화 → IPC 브로드캐스트

2. **Sync Engine (상태 머신)**
   - IDLE → PUSHING → PULLING → IDLE 루프
   - 온라인 전환 시 즉시 Push → Pull
   - 30초 주기 정기 동기화
   - 각 상태 변화를 Renderer에 IPC로 공지

3. **Renderer UI 갱신**
   - `useNetworkStatus()` hook: 온라인/오프라인 상태
   - `useSyncStatus()` hook: 현재 동기화 상태 (PUSHING, PULLING, IDLE)
   - OfflineIndicator 컴포넌트: 오프라인 배너 표시
   - SyncStatus 컴포넌트: 마지막 동기화 시각, 대기 중인 항목 수

4. **사용자 수동 동기화**
   - "지금 동기화" 버튼 (상단 우측)
   - 클릭 시 즉시 Push → Pull 실행

5. **앱 종료 안전성**
   - app.quit() 전에 진행 중인 Push/Pull 완료 대기
   - 타임아웃 설정 (예: 5초)

**완료 기준:**
- 온라인 상태: 자동 정기 동기화 (30초마다)
- 오프라인 상태: 동기화 중지, UI 배너 표시
- 오프라인 → 온라인: 즉시 Push → Pull
- 오프라인 중 메모 추가/수정: 큐에 쌓임, 온라인 복귀 시 자동 Push

---

### Week 4: 로그인 + z-order + 마무리

**목표:** Google OAuth 로그인, z-order 관리, 통합 테스트

**작업:**

1. **Google OAuth 로그인**
   - Main process: 로컬 loopback 서버 (`http://localhost:{port}/callback`) 구성
   - Renderer: 시스템 브라우저 열기 → 로그인 리다이렉트
   - Google ID Token → `POST /api/auth/google` 전송
   - 응답받은 JWT (Access + Refresh) 로컬 저장 (sync_meta.access_token)

2. **로그아웃 처리**
   - sync_meta 테이블 초기화 (토큰, lastSyncedAt 등)
   - notes 테이블 전체 삭제 (계정 간 데이터 혼입 방지)
   - retry_queue 초기화
   - 로그인 페이지로 복귀

3. **z-order 관리**
   - window.ts에서 SetWindowPos 구현
   - blur 이벤트 시 HWND_BOTTOM으로 내리기
   - 테스트: 다른 창 위에 뛰어올라왔다가, 클릭 후 포커스 이탈 시 맨 아래로

4. **삭제된 항목 UI**
   - deleted=true인 항목은 일단 숨기기 (또는 회색 처리)
   - "복구" 버튼 제공 (deleted_version 검증 후 deleted=false로 복구)
   - 수정 버튼은 비활성화

5. **통합 테스트 (수동)**
   - 오프라인 상태에서 메모 추가 → 온라인 복귀 시 자동 Push 확인
   - 다른 기기에서 동시 수정 → 최신 값으로 덮어씌워짐 확인
   - 메모 삭제 → 다른 기기에 반영 확인
   - 강제 종료 후 재시작 → Pull 복구 확인
   - 로그인 → 메모 여러 개 생성 → 오프라인 수정 → 온라인 복귀 → 동기화 확인

6. **최종 빌드 + 패키징**
   - electron-builder로 `.exe` 생성
   - 설치 테스트 (Windows에 설치 후 실행)
   - 업데이트 메커니즘 검토 (Phase 3 예정)

**완료 기준:**
- Google 로그인/로그아웃 동작
- z-order 안정적으로 유지 (다른 창보다 항상 아래)
- 전체 시나리오 통합 테스트 통과

---

## 8. 주요 구현 체크리스트

### 프로젝트 구조
- [ ] Electron 프로젝트 초기화 (typescript, webpack, webpack-dev-server)
- [ ] Main/Renderer 프로세스 분리
- [ ] IPC 통신 기본 설정
- [ ] shared/sync-core 디렉토리 구조

### SQLite 로컬 DB
- [ ] better-sqlite3 또는 sqlite3 npm 모듈 설치
- [ ] DB 파일 경로 설정 (%APPDATA%)
- [ ] 마이그레이션 스크립트 (001_init_schema.sql)
- [ ] 인덱스 생성 (date, synced, updated_at)
- [ ] 단위 테스트 (각 쿼리 함수)

### CRUD 기능
- [ ] CREATE: IPC 'note:create', 로컬 INSERT, UUID 생성
- [ ] READ: IPC 'notes:list', 날짜 범위 조회
- [ ] UPDATE: IPC 'note:update', synced=0 표시
- [ ] DELETE: IPC 'note:delete', 소프트 삭제 (deleted=true)

### sync-core 라이브러리
- [ ] push.ts: preparePushPayload, validatePushResponse, markAsSynced
- [ ] pull.ts: preparePullRequest, mergePullResponse, updateSyncMeta
- [ ] conflict.ts: resolveConflict (updatedAt 비교)
- [ ] constants.ts: CHUNK_SIZE, MAX_RETRIES 등
- [ ] 단위 테스트 (각 함수 mock 데이터로)

### 네트워크 동기화
- [ ] API 클라이언트 (fetch 기반 HTTP)
- [ ] JWT 토큰 관리 (저장, 갱신)
- [ ] Push 핸들러 (synced=0 배치 전송)
- [ ] Pull 핸들러 (청크/커서 기반)
- [ ] Retry Queue (exponential backoff)
- [ ] Conflict Resolver (LWW 기반)

### 네트워크 상태 감지
- [ ] NetworkMonitor: navigator.onLine + ping
- [ ] SyncEngine: 상태 머신 (IDLE → PUSHING → PULLING)
- [ ] 온라인 전환 시 즉시 동기화
- [ ] 30초 주기 정기 동기화
- [ ] 동기화 상태 IPC 공지

### UI 컴포넌트
- [ ] MonthView: 월간 캘린더
- [ ] DayCell: 각 날짜 셀 (메모 수 표시)
- [ ] NoteModal: 입력/수정 폼
- [ ] OfflineIndicator: 오프라인 배너
- [ ] SyncStatus: 동기화 상태 표시
- [ ] 색상 선택 (4-5개 기본 색상)

### 로그인 + OAuth
- [ ] 로컬 loopback 서버 (localhost:{port}/callback)
- [ ] 시스템 브라우저 열기 (URL 전달)
- [ ] Google ID Token 수신 → 백엔드 검증
- [ ] Access/Refresh JWT 저장 (sync_meta)
- [ ] 로그아웃: DB 전체 초기화

### z-order 관리
- [ ] koffi 설치 (user32.dll 호출)
- [ ] SetWindowPos(HWND_BOTTOM) 구현
- [ ] blur 이벤트 리스너
- [ ] 실제 Windows 환경에서 테스트

### 통합 테스트
- [ ] 오프라인 CRUD → 온라인 복귀 → Push 확인
- [ ] 다중 기기 동시 수정 → LWW 적용 확인
- [ ] Pull 중 강제 종료 → lastPullCursor 복구 확인
- [ ] 메모 삭제 → deleted_version 증가 확인
- [ ] 로그아웃 후 다른 계정 로그인 → 데이터 초기화 확인

---

## 9. 파일 우선순위 (개발 시 먼저 작성할 순서)

```
1순위 (필수 기초)
├── src/shared/types/Note.ts            # 데이터 모델 정의
├── src/shared/types/SyncMeta.ts
├── src/shared/types/IPC.ts
└── src/main/db/sqlite.ts               # DB 초기화

2순위 (CRUD 기반)
├── src/main/db/migrations/001_init_schema.sql
├── src/main/db/queries/notes.ts
├── src/main/ipc/crud.ts
└── src/renderer/components/Calendar/MonthView.tsx

3순위 (동기화 로직)
├── src/shared/sync-core/push.ts
├── src/shared/sync-core/pull.ts
├── src/shared/sync-core/conflict.ts
├── src/main/sync/sync-engine.ts
└── src/main/sync/network-monitor.ts

4순위 (UI/UX)
├── src/renderer/pages/LoginPage.tsx
├── src/renderer/hooks/useSyncStatus.ts
├── src/renderer/components/Sync/SyncStatus.tsx
└── src/renderer/components/Sync/OfflineIndicator.tsx

5순위 (마무리)
├── src/main/window.ts                  # z-order (koffi)
├── src/renderer/services/api-client.ts # Google OAuth
└── 통합 테스트 시나리오
```

---

## 10. 예상 라이브러리 스택

| 범주 | 라이브러리 | 사유 |
|------|----------|------|
| **Electron** | electron, electron-builder, electron-forge | 데스크톱 앱 |
| **DB** | better-sqlite3 (추천) 또는 sqlite3 | 로컬 SQLite |
| **UI** | React, React DOM | 렌더러 |
| **상태관리** | Zustand 또는 Jotai | 가벼운 상태 관리 |
| **HTTP** | fetch (내장) 또는 axios | API 호출 |
| **Windows API** | koffi | SetWindowPos 호출 |
| **타입** | TypeScript | 타입 안전성 |
| **테스트** | Jest 또는 Vitest | 단위 테스트 |
| **번들러** | webpack | Electron 번들링 |
| **스타일** | Tailwind CSS 또는 styled-components | CSS-in-JS |

---

## 11. 주의 사항 및 예상 함정

### 타임존 문제
- `date` 필드는 항상 **'YYYY-MM-DD'** 형식 (LocalDate)
- `updated_at`은 항상 **ISO 8601 UTC** 형식 (Z 포함)
- 자정 근처 작성 시 타임존 변환으로 날짜 밀림 버그 방지

### 클라이언트 시계 오차
- 클라이언트는 `updated_at`을 **보내지 않음**
- 서버가 모든 쓰기에 `NOW()` 찍음
- LWW의 기준을 서버 시각으로 통일

### SQLite 동시성
- better-sqlite3는 동기 API (스레드 세이프 하지만 성능 주의)
- 대량 쓰기 시 트랜잭션으로 감싸기
- WAL(Write-Ahead Logging) 모드 활성화 권장

### Main/Renderer 프로세스 통신
- IPC는 비동기 (메시지 기반)
- 오래 걸리는 작업은 Main에서 수행, 완료 후 IPC로 알림
- 실시간 업데이트는 Main → Renderer IPC 브로드캐스트

### 강제 종료 시 데이터 손실
- 진행 중인 Push/Pull을 `pullInProgress`, `push_in_progress` 플래그로 추적
- 앱 종료 전 진행 중인 동기화 완료 대기 (타임아웃 설정)
- 재시작 시 미완료 작업 자동 복구

---

## 12. 다음 단계 (Phase 3)

1. **WebSocket 실시간 반영** (5-6)
   - 로그인 성공 후 WebSocket 연결
   - `/topic/notes/{userId}` 구독
   - 다른 기기 변경사항 실시간 수신

2. **React Native 클라이언트** (모바일)
   - sync-core 로직 공유
   - NetInfo + AppState 트리거
   - op-sqlite 로컬 DB

3. **홈서버 배포**
   - DDNS 설정 (DuckDNS)
   - 리버스 프록시 (Caddy/Nginx + Let's Encrypt)
   - 운영 모니터링

---

**작성일:** 2026-08-27  
**버전:** Phase 2 상세 계획 v1.0  
**다음 검토:** Phase 1 백엔드 완성 후 (예상: 2주 후)
