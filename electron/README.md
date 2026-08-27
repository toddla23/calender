# Electron 클라이언트 (Windows 위젯 캘린더)

오프라인/온라인 동기화를 지원하는 Windows 데스크톱 캘린더 위젯

## 상태

**Phase 2-1 진행 중** — SQLite + sync-core 기초 완성

### ✅ 완료된 것

1. **SQLite 로컬 DB**
   - notes 테이블 (CRUD with synced flag)
   - sync_meta 테이블 (메타데이터, 토큰 저장)
   - 인덱스 설정 (성능)

2. **sync-core 공유 라이브러리** (순수 함수)
   - `conflict.ts` — LWW, deleted_version 기반 충돌 해결
   - `push.ts` — Push 페이로드 준비, 응답 검증
   - `pull.ts` — Pull 요청/응답 처리, 청크/커서
   - `constants.ts` — 동기화 상수

3. **IPC 핸들러**
   - CRUD (create, read, update, delete)
   - Sync (getSyncStatus, pushNotes, pullNotes, setAuthTokens)
   - Network (getNetworkStatus)
   - 공통 응답 래핑

4. **엔티티 & 저장소**
   - `NotesRepository` (notes 테이블 CRUD)
   - `SyncMetaRepository` (메타데이터 관리)
   - 타입 안전성 (TypeScript)

5. **기본 구조**
   - `package.json` (의존성 및 빌드 설정)
   - `tsconfig.json` (TypeScript 설정)
   - Electron 진입점 (`src/main/index.ts`)
   - React 진입점 (`src/renderer/App.tsx`)

### ⏳ 다음 단계 (Phase 2-2 이후)

1. **Push/Pull 구현**
   - Push: synced=0 항목 → 서버
   - Pull: 청크/커서 루프, 강제 종료 복구
   - exponential backoff 재시도

2. **네트워크 감지**
   - navigator.onLine + ping
   - 온라인/오프라인 자동 동기화 트리거
   - 상태 이벤트

3. **UI 컴포넌트**
   - 월간 캘린더 뷰
   - 메모 입력 모달
   - 동기화 상태 표시
   - 오프라인 배너

4. **Google OAuth**
   - 로그인 페이지
   - ID Token 획득
   - JWT 토큰 저장 (IPC via SyncMetaRepository)

5. **z-order 관리**
   - SetWindowPos(HWND_BOTTOM) 호출
   - blur 이벤트 시 항상 맨 아래

6. **테스트**
   - 단위 테스트 (sync-core, 저장소)
   - 통합 테스트 (백엔드 연동)
   - 시나리오 테스트 (오프라인/온라인 전환)

---

## 프로젝트 구조

```
electron/
├── src/
│   ├── main/
│   │   ├── index.ts              ← 진입점
│   │   ├── db/
│   │   │   ├── sqlite.ts         ← 연결 & 초기화
│   │   │   └── queries/
│   │   │       ├── notes.ts      ← CRUD
│   │   │       └── sync-meta.ts  ← 메타데이터
│   │   └── ipc/
│   │       ├── handlers.ts       ← 핸들러 레지스트리
│   │       ├── crud.ts           ← CRUD 핸들러
│   │       ├── sync.ts           ← 동기화 핸들러
│   │       └── network.ts        ← 네트워크 핸들러
│   ├── renderer/
│   │   ├── index.html
│   │   ├── App.tsx               ← React 루트
│   │   └── components/           ← (향후)
│   └── shared/
│       ├── types/
│       │   ├── Note.ts
│       │   ├── SyncMeta.ts
│       │   └── IPC.ts
│       └── sync-core/            ← 공유 동기화 로직
│           ├── conflict.ts       ← 충돌 해결
│           ├── push.ts           ← Push 로직
│           ├── pull.ts           ← Pull 로직
│           └── constants.ts      ← 상수
├── package.json
├── tsconfig.json
└── README.md
```

---

## 설치 및 개발

### 필수 요구사항

- Node.js 18+
- npm 9+

### 설치

```bash
cd electron
npm install
```

### 개발 모드

```bash
npm run dev
```

- React Dev Server: `http://localhost:3000`
- Electron 앱: 자동 실행
- Hot reload: 활성화

### 빌드

```bash
npm run build
```

생성 파일: `dist/Calendar Widget Setup.exe` (Windows)

---

## 핵심 설계

### 오프라인 우선

1. 사용자가 메모 입력 → **즉시 SQLite 저장** (synced=0)
2. **UI 즉시 갱신** (서버 응답 대기 X)
3. 온라인이면 백그라운드 Push

### 동기화 프로토콜 (sync-core)

**Push → Pull 순서**
```
1. Push: synced=0 항목들 서버에 전송
2. Pull: 청크/커서로 최신 상태 수신
3. 머지: ConflictResolver로 충돌 해결 (LWW, deleted_version)
```

**충돌 해결**
- **Last-Write-Wins**: updated_at 기준
- **Tombstone**: deleted_version으로 삭제-수정 충돌 방지

### 부분 실패 복구

```
Pull 중 강제 종료:
  → lastPullCursor 영속화
  → 재시작 시 마지막 지점부터 복구

Push 중 강제 종료:
  → synced=0 유지
  → 재시작 시 자동 재Push
```

---

## IPC 채널

### CRUD

```typescript
// 메모 생성
ipcRenderer.invoke('crud:create-note', {
  note: { date: '2026-08-27', content: '회의 3시', color: '#FF5733' }
})

// 메모 조회
ipcRenderer.invoke('crud:read-notes', {
  startDate: '2026-08-01',
  endDate: '2026-08-31'
})

// 메모 수정
ipcRenderer.invoke('crud:update-note', {
  update: { id: 'uuid', content: '수정됨' }
})

// 메모 삭제 (소프트)
ipcRenderer.invoke('crud:delete-note', { id: 'uuid' })
```

### 동기화

```typescript
// 동기화 상태 조회
ipcRenderer.invoke('sync:get-status', {})

// Push 실행
ipcRenderer.invoke('sync:push', { forceSync: false })

// Pull 실행
ipcRenderer.invoke('sync:pull', { cursor: null })

// 토큰 설정
ipcRenderer.invoke('sync:set-auth-tokens', {
  accessToken: '...',
  refreshToken: '...',
  userId: 'uuid',
  userEmail: 'user@gmail.com'
})
```

### 네트워크

```typescript
// 네트워크 상태 조회
ipcRenderer.invoke('network:get-status', {})

// 네트워크 변경 이벤트 구독
ipcRenderer.on('event:network-status-changed', (event, status) => {
  console.log('Online:', status.online);
})
```

---

## 다음 읽을 문서

- [Phase 2 계획](../PHASE2_ELECTRON_PLAN.md)
- [동기화 프로토콜](../docs/SYNC_PROTOCOL.md)
- [API 명세](../docs/API.md)
