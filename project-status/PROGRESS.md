# 캘린더 앱 프로젝트 진행 상황

**마지막 업데이트:** 2026-08-27  
**현재 상태:** Phase 2-1 완료 (Electron 기초)

---

## 🎯 프로젝트 개요

**목표:** 오프라인 지원 캘린더 앱 (Windows 위젯 + 모바일)
**아키텍처:** 모노레포 (backend, electron, react-native)
**핵심:** 모든 기기 간 자동 동기화, 오프라인 우선

---

## ✅ Phase 1: Spring Boot 백엔드 (완료)

### 구현 완료

**1. 프로젝트 설정**
- Java 21, Spring Boot 3.3, Gradle
- PostgreSQL 15, Flyway 마이그레이션
- 환경별 설정 (local, prod)

**2. 인증 (Google OAuth2 + JWT)**
- `POST /api/auth/google` — ID Token 검증 → JWT 발급
- `POST /api/auth/refresh` — Access Token 갱신
- 최초 로그인 시 User 자동 생성

**3. 동기화 API (청크/커서 기반)**
- `GET /api/sync/pull?since={ts}&cursor={id}&limit=50`
  - Pull 응답: items, next_cursor, has_more, server_time
  - 부분 실패 시 lastPullCursor부터 복구 가능
  
- `POST /api/sync/push`
  - 배치 업로드 (개별 항목 성공/실패)
  - 원자적 upsert (ON CONFLICT)

**4. 데이터베이스 스키마**
- `users` — Google 계정 매핑
- `notes` — 메모 (deleted_version 포함)
- `holidays` — 공휴일 캐싱
- `refresh_tokens` — 토큰 관리

**5. 핵심 설계**
- **LWW (Last-Write-Wins):** updated_at 기준 (서버 발급)
- **Tombstone 버전닝:** deleted_version으로 삭제-수정 충돌 방지
- **클라이언트 시계 오차 배제:** 모든 쓰기에 서버 NOW() 적용

### 파일 구조
```
backend/
├── src/main/java/com/calendar/
│   ├── controller/          (AuthController, SyncController)
│   ├── service/             (AuthService, SyncService)
│   ├── entity/              (User, Note)
│   ├── repository/          (UserRepository, NoteRepository)
│   ├── dto/                 (AuthRequest, NoteDto, SyncResponse)
│   └── util/                (JwtTokenProvider, GoogleOAuthValidator)
├── src/main/resources/
│   ├── application.yml
│   ├── application-local.yml
│   └── db/migration/V1__init_schema.sql
└── build.gradle
```

### 문서
- `docs/SETUP.md` — 개발 환경 설정 (50+ 항목)
- `docs/API.md` — API 엔드포인트 명세
- `docs/SYNC_PROTOCOL.md` — 동기화 프로토콜 (10개 섹션)
- `docs/ARCHITECTURE.md` — 아키텍처 개요

---

## ✅ Phase 2-1: Electron 클라이언트 기초 (완료)

[상세보기: PHASE_2_2_IMPLEMENTATION.md](PHASE_2_2_IMPLEMENTATION.md)

## ✅ Phase 2-2: Push/Pull + 네트워크 감지 (완료)

[상세보기: PHASE_2_2_IMPLEMENTATION.md](PHASE_2_2_IMPLEMENTATION.md)

## ✅ Phase 2-3: UI 컴포넌트 + Google OAuth (완료)

[상세보기: PHASE_2_3_IMPLEMENTATION.md](PHASE_2_3_IMPLEMENTATION.md)

### 구현 완료

**1. SQLite 로컬 DB**
- `notes` 테이블
  - 필드: id, date, content, color, deleted, deleted_version, updated_at, synced, created_at
  - 인덱스: date, synced, updated_at, deleted
  
- `sync_meta` 테이블
  - 싱글톤 (id=1)
  - 필드: last_synced_at, last_pull_cursor, pull_in_progress, access_token, refresh_token, user_id, user_email

**2. 저장소 계층**
- `NotesRepository`
  - createNote, readNotes, updateNote, deleteNote
  - getNoteById, getNotesByDate, getUnsyncedNotes
  - deleted_version 자동 계산
  - markAsSynced (배치)

- `SyncMetaRepository`
  - getSyncMeta, setLastSyncedAt, setLastPullCursor
  - setPullInProgress, setAuthTokens, clearAuthTokens

**3. sync-core 공유 라이브러리** (순수 함수)
- `conflict.ts` — 충돌 해결
  - Last-Write-Wins (updated_at 비교)
  - Tombstone 버전닝 (deleted_version)
  - mergeNote (로컬/서버 병합)

- `push.ts` — Push 로직
  - preparePushPayload (synced=0 항목 준비)
  - validateResponse (응답 검증)
  - getSuccessfulIds, getFailedIds

- `pull.ts` — Pull 로직
  - preparePullRequest (청크/커서)
  - validateResponse (응답 검증)
  - convertToNote (타입 변환)
  - detectServerTimeRegression (시계 역행 감지)

- `constants.ts` — 동기화 상수
  - CHUNK_SIZE=50, RETRY_TIMES=5, SYNC_INTERVAL_MS=30000 등

**4. IPC 핸들러**
- `handlers.ts` — 핸들러 레지스트리 (모든 IPC 등록)
- `crud.ts` — CRUD 핸들러
  - create, read, update, delete, getNoteByDate
- `sync.ts` — 동기화 핸들러 (향후 구현)
  - getSyncStatus, pushNotes, pullNotes, setAuthTokens
- `network.ts` — 네트워크 핸들러
  - getNetworkStatus, updateNetworkStatus

**5. 타입 정의**
- `Note.ts` — Note, NoteInput, NoteUpdate 인터페이스
- `SyncMeta.ts` — SyncMeta, SyncStatus, NetworkStatus 인터페이스
- `IPC.ts` — IPC 채널 정의 및 요청/응답 타입

**6. Electron 기본 구조**
- `src/main/index.ts` — Main process 진입점
- `src/renderer/App.tsx` — React 루트 컴포넌트
- `src/renderer/index.html` — HTML 진입점
- `package.json` — 의존성 및 빌드 설정
- `tsconfig.json` — TypeScript 설정

### 파일 구조
```
electron/
├── src/
│   ├── main/
│   │   ├── index.ts                    ← 진입점
│   │   ├── db/
│   │   │   ├── sqlite.ts               ← SQLite 연결/초기화
│   │   │   └── queries/
│   │   │       ├── notes.ts            ← NotesRepository
│   │   │       └── sync-meta.ts        ← SyncMetaRepository
│   │   └── ipc/
│   │       ├── handlers.ts             ← 핸들러 레지스트리
│   │       ├── crud.ts                 ← CRUD 핸들러
│   │       ├── sync.ts                 ← 동기화 핸들러 (향후)
│   │       └── network.ts              ← 네트워크 핸들러
│   ├── renderer/
│   │   ├── index.html
│   │   └── App.tsx                     ← React 루트
│   └── shared/
│       ├── types/
│       │   ├── Note.ts
│       │   ├── SyncMeta.ts
│       │   └── IPC.ts
│       └── sync-core/
│           ├── conflict.ts             ← 충돌 해결
│           ├── push.ts                 ← Push 로직
│           ├── pull.ts                 ← Pull 로직
│           ├── index.ts                ← export
│           └── constants.ts            ← 상수
├── package.json
├── tsconfig.json
└── README.md
```

### 구현 완료

**Phase 2-2에서 구현됨:**
- ✅ `sync.ts` 핸들러의 pushNotes, pullNotes 로직
- ✅ 네트워크 감지 (navigator.onLine, 헬스 체크)
- ✅ 동기화 엔진 (상태 머신: idle/syncing/error/paused)
- ✅ 재시도 로직 (exponential backoff: 1s → 32s, 최대 5회)
- ✅ HTTP 클라이언트 (axios, JWT Bearer Token)
- ✅ 메인 프로세스 통합 (SyncEngine 시작/정리)

**Phase 2-3에서 구현됨:**
- ✅ UI 컴포넌트 (Calendar, NotesList, NoteModal, SyncStatus)
- ✅ 상태 관리 (Zustand: notes, sync, auth 스토어)
- ✅ 로그인 페이지 (Google OAuth 버튼 + 기능 소개)
- ✅ Preload 스크립트 (IPC 브릿지)
- ✅ 렌더러 진입점 (index.tsx)
- ✅ 글로벌 스타일 (index.css)
- ✅ 백엔드 헬스 체크 (/api/health)
- ✅ 윈도우 크기 조정 (400x600 → 1000x700)

### 다음 구현 예정 (Phase 2-4)

**아직 구현되지 않은 것:**
- Google OAuth 실제 구현 (google-auth-library 통합)
- JWT Token Refresh 자동 갱신
- z-order 관리 (윈도우 위젯 배치)
- 앱 시작 시 pull_in_progress 상태 정리
- WebSocket 실시간 업데이트 (Phase 3)

---

## 📊 Git 커밋 현황

```
(Phase 2-3 커밋 예정)
(Phase 2-2 커밋 예정)
d2fffb7 feat: Phase 2-1 Electron 클라이언트 기초구현 (22 files, 2,179 lines)
5c8a1ac feat: Phase 1 완료 (27 files, 3,104 lines)
7413342 frist commit
```

**Phase 2-2 추가 파일:**
- `electron/src/main/api/http-client.ts` (60줄)
- `electron/src/main/api/retry.ts` (40줄)
- `electron/src/main/sync/network-monitor.ts` (65줄)
- `electron/src/main/sync/sync-engine.ts` (100줄)
- 수정: `sync.ts`, `network.ts`, `handlers.ts`, `index.ts` (+350줄)

**Phase 2-3 추가 파일:**
- 렌더러 (React): ~800줄
  - 컴포넌트: Calendar, NotesList, NoteModal, SyncStatus
  - 페이지: LoginPage
  - 스토어: notes, sync, auth
- 스타일 (CSS Modules): ~400줄
  - 8개 컴포넌트 스타일 + 글로벌 스타일
- Preload 스크립트: ~20줄
- 백엔드: HealthController.java (~10줄)

**총 코드량:** ~7,000줄 (문서 제외)

---

## 🎯 다음 단계 (Phase 2-4)

### 우선순위

1. **Google OAuth 실제 구현** (중요)
   - google-auth-library 통합
   - 팝업 또는 리다이렉트 방식
   - 에러 처리

2. **Token Refresh 자동화**
   - 401 에러 감지
   - Refresh Token으로 자동 갱신
   - 재요청 처리

3. **초기화 상태 정리**
   - 앱 시작 시 pull_in_progress 정리
   - 비정상 종료 복구

4. **z-order 관리 (Windows)**
   - koffi + SetWindowPos(HWND_BOTTOM)
   - 창 투명도 조정

5. **성능 최적화**
   - 메모 가상화 (많은 항목)
   - 캘린더 메모이제이션

### 예상 기간
- Phase 2-4 (OAuth + Token Refresh): 1주
- Phase 3 (WebSocket + 실시간): 2-3주
- Phase 3 (React Native + 완성): 2-3주

---

## 📚 핵심 개념 요약

### 동기화 프로토콜

```
사용자 입력
  ↓
로컬 SQLite 저장 (synced=0)
  ↓
UI 즉시 갱신
  ↓
[온라인] → Push (synced=0 항목) → Pull (최신 상태)
[오프라인] → synced=0 큐에 쌓음 → 온라인 복귀 시 자동 동기화
```

### 충돌 해결

**Last-Write-Wins (LWW)**
- 기준: updated_at (서버 발급, UTC)
- 더 나중 시간의 값이 이김

**Tombstone 버전닝**
- deleted_version으로 삭제-수정 충돌 방지
- 삭제 시: deleted_version++
- 수정 시: deleted=false인 항목에만 허용

### 부분 실패 복구

```
Pull 중 강제 종료:
  lastPullCursor 영속화
  → 재시작 시 마지막 지점부터 복구

Push 중 강제 종료:
  synced=0 유지
  → 재시작 시 자동 재Push
```

---

## 📖 주요 문서

- `docs/SETUP.md` — 로컬 개발 환경 설정
- `docs/API.md` — 백엔드 API 명세
- `docs/SYNC_PROTOCOL.md` — 동기화 프로토콜 상세
- `docs/ARCHITECTURE.md` — 전체 아키텍처
- `PHASE2_ELECTRON_PLAN.md` — Electron 구현 계획
- `electron/README.md` — Electron 프로젝트 개요

---

## 🔗 유용한 링크

**프로젝트 구조 탐색:**
```bash
# 백엔드
cd backend && ./gradlew bootRun --args='--spring.profiles.active=local'

# Electron
cd electron && npm install && npm run dev

# 데이터베이스
docker-compose up -d
```

**테스트**
```bash
# PostgreSQL 확인
psql -h localhost -U postgres -d calendar_db -c "\dt"

# API 테스트 (백엔드 실행 후)
curl -X POST http://localhost:8080/api/auth/google ...
```

---

## ⚠️ 주의사항

1. **클라이언트 시계 오차**
   - 서버가 모든 쓰기에 NOW() 찍기
   - 클라이언트는 updated_at 전송 금지

2. **타임존 함정**
   - date 필드는 순수 DATE (타임존 없음)
   - updated_at은 UTC 타임스탬프

3. **동기화 순서**
   - 반드시 Push → Pull (이 순서!)
   - Pull 먼저 하면 로컬 변경이 덮어씌워질 수 있음

4. **강제 종료 복구**
   - lastPullCursor + pullInProgress 플래그 필수
   - synced=0 플래그로 미동기 항목 추적

---

## 📝 Phase 2-4 작업 시작 체크리스트

- [ ] 이 문서 읽기
- [ ] PHASE_2_3_IMPLEMENTATION.md 검토
- [ ] 로컬 환경 설정 (docker-compose up, npm install, npm run dev)
- [ ] Electron 앱 실행 테스트
- [ ] 테스트 모드에서 메모 작성/수정/삭제 확인
- [ ] 날짜 선택 및 캘린더 네비게이션 테스트
- [ ] 동기화 상태 표시 확인
- [ ] Google OAuth 실제 구현 (google-auth-library)
- [ ] Token Refresh 로직 추가
- [ ] z-order 관리 구현 (Windows)

---

---

## 📦 Phase 2-2 완성 요약

| 항목 | 상태 | 상세 |
|------|------|------|
| HTTP 클라이언트 | ✅ 완료 | Axios 기반, JWT Bearer 토큰 지원 |
| 재시도 로직 | ✅ 완료 | Exponential backoff (1s→32s, 5회) |
| Push 핸들러 | ✅ 완료 | synced=0 항목 배치 업로드 |
| Pull 핸들러 | ✅ 완료 | 청크/커서 기반, 충돌 해결 포함 |
| 네트워크 감지 | ✅ 완료 | 온/오프라인 자동 감지 + 헬스 체크 |
| 동기화 엔진 | ✅ 완료 | 상태 머신, 30초 주기 자동 동기화 |
| 메인 프로세스 통합 | ✅ 완료 | SyncEngine 시작/정리 |
| 문서화 | ✅ 완료 | 아키텍처, 흐름도, 테스트 시나리오 |

---

## 📦 Phase 2-3 완성 요약

| 항목 | 상태 | 상세 |
|------|------|------|
| Calendar 컴포넌트 | ✅ 완료 | 월간 뷰, 네비게이션, 메모 표시 |
| NotesList 컴포넌트 | ✅ 완료 | 메모 목록, 색상, 미동기 배지 |
| NoteModal 컴포넌트 | ✅ 완료 | 작성/수정, 색상 선택, 삭제 |
| SyncStatus 컴포넌트 | ✅ 완료 | 네트워크 상태, 진행 표시, 에러 |
| LoginPage 페이지 | ✅ 완료 | Google 로그인 버튼, 기능 소개 |
| 상태 관리 (Zustand) | ✅ 완료 | notes, sync, auth 스토어 |
| Preload 스크립트 | ✅ 완료 | IPC 브릿지 (contextBridge) |
| 렌더러 진입점 | ✅ 완료 | index.tsx + 글로벌 스타일 |
| 백엔드 헬스 체크 | ✅ 완료 | /api/health GET 엔드포인트 |
| 문서화 | ✅ 완료 | UI 디자인, 데이터 흐름, 테스트 |

---

**작성자:** Claude Code  
**최종 수정:** 2026-08-27  
**완료 버전:** Phase 2-1, 2-2, 2-3
