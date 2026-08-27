# 동기화 프로토콜

캘린더 앱의 핵심 설계: **오프라인 우선**, **모든 기기 간 자동 동기화**, **충돌 해결**.

참고: [calendar-app-plan.md](../calendar-app-plan.md) 섹션 5, 6

---

## 개요

### 핵심 원칙

1. **로컬 DB 기준 렌더링:** 사용자가 입력하면 즉시 로컬 DB에 저장 → 화면 갱신 (서버 응답 대기 X)
2. **Push → Pull 순서:** 로컬 변경을 먼저 서버에 반영, 이어 Pull로 최신 상태 받기
3. **Last-Write-Wins (LWW):** 더 나중에 수정한 쪽이 이김 (기준: `updated_at`)
4. **Tombstone 버전닝:** 삭제-수정 충돌 방지 (`deleted_version`)
5. **강제 종료 복구:** 메타데이터 영속화로 언제든 안전하게 복구

---

## 1. 로컬 저장소 (클라이언트)

### 1-1. SQLite 스키마

```sql
-- 메모 테이블
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  content TEXT NOT NULL,
  color TEXT,
  deleted INTEGER DEFAULT 0,           -- 0 또는 1
  deleted_version INTEGER DEFAULT 0,   -- Tombstone 버전
  updated_at TEXT NOT NULL,            -- ISO 8601 형식
  synced INTEGER DEFAULT 0,            -- 0=미동기, 1=동기됨
  created_at TEXT NOT NULL
);

-- 동기화 메타데이터
CREATE TABLE sync_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- 싱글톤
  last_synced_at TEXT,                    -- 마지막 서버 시각
  last_pull_cursor TEXT,                  -- 마지막 Pull의 nextCursor
  pull_in_progress INTEGER DEFAULT 0,     -- 0 또는 1
  created_at TEXT NOT NULL
);
```

### 1-2. 주요 필드 설명

| 필드 | 용도 | 예시 |
|------|------|------|
| `synced` | 서버 반영 여부 추적 | 0=로컬만, 1=동기됨 |
| `updated_at` | Pull 시 서버와 비교 | "2026-08-27T10:30:00Z" |
| `deleted_version` | Tombstone 추적 | 0=정상, 1+=삭제 이력 있음 |
| `last_pull_cursor` | 부분 Pull 복구 | UUID 또는 null |
| `pull_in_progress` | 강제 종료 감지 | 0=완료, 1=진행 중 |

---

## 2. 쓰기 경로 (사용자가 입력할 때)

```
사용자가 메모 입력/수정/삭제
  ↓
로컬 DB에 즉시 upsert:
  - id = 클라이언트 UUID (중복 시 기존 항목 덮어쓰기)
  - updated_at = 현재 시각
  - synced = 0
  - deleted = true/false
  - deleted_version = (상황에 따라 증가)
  ↓
UI 즉시 갱신 (로컬 DB 기준 렌더)
  ↓
[온라인 상태]
  → 백그라운드에서 즉시 Push 시도
  → synced=1로 표시 (성공 시)
  ↓
[오프라인 상태]
  → synced=0 그대로 유지
  → 온라인 복귀 시 자동 Push
```

### 예시

**메모 생성 (오프라인)**
```javascript
// 입력
const noteId = generateUUID();
const note = {
  id: noteId,
  date: "2026-08-27",
  content: "회의 3시",
  color: "#FF5733",
  deleted: false,
  deleted_version: 0,
  updated_at: new Date().toISOString(),
  synced: 0  // ← 미동기 마킹
};

// 로컬 DB 저장
await localDb.insert('notes', note);

// UI 갱신 (즉시)
setNotes([...notes, note]);
```

**메모 삭제**
```javascript
// 사용자가 "삭제" 클릭
const updatedNote = {
  ...existingNote,
  deleted: true,
  deleted_version: existingNote.deleted_version + 1,  // ← 버전 증가
  updated_at: new Date().toISOString(),
  synced: 0
};

// 로컬 DB 갱신 (upsert)
await localDb.update('notes', updatedNote);

// UI에서 삭제된 항목으로 표시 (또는 숨김)
```

---

## 3. 동기화 루틴 (Push → Pull)

### 3-1. 동기화 트리거

동기화는 **두 가지 상황**에서 시작됩니다:

```
트리거 1: 오프라인 → 온라인 전환
  - Electron: navigator.onLine + 주기적 ping
  - React Native: NetInfo.fetch()

트리거 2: 앱이 백그라운드 → 포그라운드 복귀
  - React Native: AppState 이벤트 (모바일 특유)
  - 이유: 앱이 꺼져있던 시간에도 서버 업데이트 받기 위함
```

### 3-2. Push 단계

```
1) synced=0인 항목 수집
   SELECT * FROM notes WHERE synced=0
   
2) 배치로 POST /api/sync/push 전송
   [
     {id, date, content, color, deleted, deleted_version},
     ...
   ]

3) 응답 처리
   - success=true 항목만 synced=1로 표시
   - success=false 항목은 synced=0 유지 (재시도)
   - 응답 확인 전까지 절대 synced=1 처리 금지
     (앱이 강제 종료돼도 다시 Push할 수 있도록)

4) exponential backoff 재시도
   1차 실패: 1초 후
   2차 실패: 2초 후
   3차 실패: 4초 후
   ...
   최대 5회까지 재시도
```

**예시 (Electron/React Native 로직)**
```javascript
async function syncPush(userId) {
  const unsynced = await localDb.query(
    'SELECT * FROM notes WHERE user_id=? AND synced=0',
    [userId]
  );

  if (unsynced.length === 0) return; // 할 일 없음

  try {
    const response = await api.post('/api/sync/push', unsynced);

    // 개별 항목 처리
    for (const result of response) {
      if (result.success) {
        // ✓ 성공: synced=1로 표시
        await localDb.update('notes', 
          { id: result.id, synced: 1 }
        );
      } else {
        // ✗ 실패: synced=0 유지, 로그 기록
        console.error(`Failed to sync ${result.id}: ${result.error}`);
      }
    }
  } catch (error) {
    // 네트워크 오류: synced=0 유지, 재시도 큐에 추가
    console.error('Push failed (will retry):', error);
    scheduleRetry(syncPush, exponentialBackoff());
  }
}
```

### 3-3. Pull 단계 (청크/커서 기반)

```
1) Pull 시작 조건 확인
   - lastSyncedAt 확인 (첫 Pull이면 "1970-01-01T00:00:00Z")
   - lastPullCursor 확인 (이어서 Pull하는 경우)
   - pullInProgress 체크 (강제 종료 복구)

2) 각 청크마다 요청
   GET /api/sync/pull?since={lastSyncedAt}&cursor={lastPullCursor}&limit=50

3) 응답 처리
   {
     items: [...최대 50개...],
     next_cursor: "uuid-50" or null,
     has_more: true or false,
     server_time: "2026-08-27T10:30:15Z"
   }

4) 로컬 DB 머지
   for each item in response.items:
     if item.updated_at > localNote.updated_at:
       로컬 DB 갱신 (서버 값이 더 최신)
     else:
       로컬 DB 유지 (로컬이 더 최신)

5) 메타데이터 저장
   - lastPullCursor = response.nextCursor
   - if response.hasMore == false:
       lastSyncedAt = response.serverTime

6) 다음 청크 여부 판단
   if response.nextCursor != null:
     다시 Pull 요청 (step 2로)
   else:
     Pull 완료
```

**예시 (Pull 루프)**
```javascript
async function syncPull(userId) {
  let syncMeta = await localDb.queryOne('SELECT * FROM sync_meta WHERE id=1');
  
  if (!syncMeta) {
    syncMeta = {
      id: 1,
      last_synced_at: null,
      last_pull_cursor: null,
      pull_in_progress: 0,
      created_at: new Date().toISOString()
    };
    await localDb.insert('sync_meta', syncMeta);
  }

  // 강제 종료 복구
  if (syncMeta.pull_in_progress === 1) {
    console.log('Resuming from cursor:', syncMeta.last_pull_cursor);
  }

  let cursor = syncMeta.last_pull_cursor;
  let since = syncMeta.last_synced_at || '1970-01-01T00:00:00Z';
  let hasMore = true;

  while (hasMore) {
    try {
      // Pull 진행 중 표시
      await localDb.update('sync_meta', {
        id: 1,
        pull_in_progress: 1
      });

      // 청크 요청
      const response = await api.get('/api/sync/pull', {
        params: { since, cursor, limit: 50 }
      });

      // 로컬 DB 머지
      for (const item of response.items) {
        const local = await localDb.queryOne(
          'SELECT * FROM notes WHERE id=?',
          [item.id]
        );

        if (!local || item.updated_at > local.updated_at) {
          // 서버 값이 더 최신 (또는 신규)
          await localDb.upsert('notes', {
            ...item,
            synced: 1  // Pull 받은 항목은 synced=1
          });
        }
      }

      // 커서 저장 (각 청크마다)
      cursor = response.next_cursor;
      await localDb.update('sync_meta', {
        id: 1,
        last_pull_cursor: cursor
      });

      hasMore = response.has_more && cursor !== null;

      // 완료 시 lastSyncedAt 갱신
      if (!hasMore) {
        await localDb.update('sync_meta', {
          id: 1,
          last_synced_at: response.server_time,
          pull_in_progress: 0
        });
      }
    } catch (error) {
      console.error('Pull error:', error);
      // 강제 종료 시에도 lastPullCursor 있으면 복구 가능
      await localDb.update('sync_meta', {
        id: 1,
        pull_in_progress: 0  // 재시도 준비
      });
      throw error;
    }
  }
}
```

---

## 4. 충돌 해결 (서버 측)

### 4-1. Last-Write-Wins (LWW)

기본 원칙: **더 나중에 수정한 쪽이 이김**

```
기기 A: "회의 3시" (updated_at: 09:00)
기기 B: "회의 4시" (updated_at: 09:05)
                  ↑
                  B가 더 최신이므로 "회의 4시"가 최종 값
```

서버는 모든 쓰기에 `updated_at = NOW()`를 자동으로 찍습니다.
→ 클라이언트 시계 오차 무시 가능

### 4-2. Tombstone 버전닝 (deleted_version)

문제: 삭제와 수정이 동시에 일어나면?

```
기기 A: 항목 삭제 → deleted=true
기기 B: 같은 항목 수정 → content="수정됨"

단순 LWW만으로는 순서에 따라 부활/손실 가능
→ deleted_version으로 "의미적 충돌"을 논리적으로 불가능하게 만듦
```

**규칙:**
- **삭제 시:** `deleted_version++`, `deleted=true`
- **수정 시:** `deleted=false`인 항목에만 허용
  * UI: 삭제된 항목 수정 버튼 비활성화
  * 서버: 삭제된 항목 업데이트 거부

**원자적 upsert SQL (PostgreSQL)**
```sql
INSERT INTO notes (id, user_id, date, content, color, deleted, deleted_version, updated_at)
VALUES (:id, :userId, :date, :content, :color, :deleted, :deletedVersion, NOW())
ON CONFLICT (id)
DO UPDATE SET
    content = EXCLUDED.content,
    color = EXCLUDED.color,
    deleted = EXCLUDED.deleted,
    deleted_version = CASE
        WHEN EXCLUDED.deleted = true AND notes.deleted = false
            THEN notes.deleted_version + 1      -- 삭제 → 버전 증가
        WHEN EXCLUDED.deleted = false AND notes.deleted = true
            THEN EXCLUDED.deleted_version       -- 수정 → 버전 유지 불가
        ELSE notes.deleted_version
    END,
    updated_at = NOW()
WHERE notes.updated_at < NOW();
```

**예시 충돌 해결:**

**Case 1: 삭제 → 수정**
```
초기: {id, deleted=false, deleted_version=0, content="A"}

기기 A Push: {deleted=true, deleted_version=1}
→ DB: {deleted=true, deleted_version=1, content="A"}

기기 B Push: {deleted=false, deleted_version=0, content="B"}
→ Upsert 조건: EXCLUDED.deleted=false AND notes.deleted=true
→ DB: {deleted=false, deleted_version=0, content="B"}
   ⚠️ 하지만 UI에서 이미 삭제로 표시했으므로 "복구" 버튼으로만 수정 가능
```

**Case 2: 수정 → 삭제**
```
초기: {id, deleted=false, deleted_version=0, content="A"}

기기 A Push: {deleted=false, deleted_version=0, content="B"}
→ DB: {deleted=false, deleted_version=0, content="B"}

기기 B Push: {deleted=true, deleted_version=1}
→ Upsert 조건: EXCLUDED.deleted=true AND notes.deleted=false
→ DB: {deleted=true, deleted_version=2, content="B"}
   ✓ 올바르게 삭제됨, 버전 증가로 부활 방지
```

---

## 5. 강제 종료 및 복구

### 5-1. Pull 중 강제 종료

```
Pull 진행 중:
  청크 1 (50개) 받음 ✓
  → lastPullCursor = item-50 저장
  
  청크 2 (30개) 받다가 앱 강제 종료 ✗
  → lastPullCursor = item-50 영속화됨
  → pull_in_progress = 1 (진행 중 표시)

재시작 후:
  → pull_in_progress = 1 감지
  → lastPullCursor = item-50부터 다시 시작
  → item-51부터 Pull
  → 중복/손실 없음
```

### 5-2. Push 중 강제 종료

```
Push 전송 중:
  배치 1 (10개) 성공 ✓
  → 이 10개 synced=1로 표시
  
  배치 2 (10개) 전송 중 앱 강제 종료 ✗
  → synced=0 유지됨 (응답 확인 안 했으므로)

재시작 후:
  → synced=0 항목들 다시 Push
  → 이미 서버에 있는 항목은 upsert로 덮어쓰기 (LWW)
  → 손실 없음
```

### 5-3. 클라이언트 코드 예시

```javascript
async function initSync() {
  const syncMeta = await localDb.queryOne('SELECT * FROM sync_meta WHERE id=1');
  
  // 강제 종료 복구
  if (syncMeta?.pull_in_progress === 1) {
    console.log('Recovering from interrupted Pull...');
    try {
      await syncPull(userId);
    } catch (error) {
      console.error('Pull recovery failed, will retry next time', error);
    }
  }
  
  // 미동기 Push 항목 확인
  const unsynced = await localDb.query(
    'SELECT COUNT(*) as count FROM notes WHERE synced=0'
  );
  if (unsynced[0].count > 0) {
    console.log(`${unsynced[0].count} unsynced items found, pushing...`);
    await syncPush(userId);
  }
}
```

---

## 6. 오프라인 → 온라인 전환 시나리오

### 시나리오

```
사용자가 오프라인 상태에서:
  1. 메모 A 생성 (synced=0)
  2. 메모 B 수정 (synced=0)
  3. 메모 C 삭제 (synced=0, deleted_version++)

약 30분 후 온라인 복귀:
  → 네트워크 감지 (navigator.onLine / NetInfo)
  → 동기화 루틴 시작

동기화:
  1) Pull (먼저)
     → A, B, C 중 서버에 더 최신 버전 있으면 반영
     → 없으면 유지 (로컬이 이김)
  
  2) Push (나중에)
     → A, B, C를 서버에 전송
     → 서버: LWW로 이미 더 최신이면 무시
     → 서버: 로컬이 더 최신이면 반영
```

---

## 7. WebSocket 실시간 반영 (Phase 2)

```
로그인 성공 후:
  → WebSocket 연결
  → /topic/notes/{userId} 구독

다른 기기에서 Push:
  → 서버가 변경된 노트 broadcast
  → 이 기기가 WebSocket으로 수신
  → updatedAt 비교 후 더 최신이면 로컬 DB 갱신
  
에코 루프 방지:
  → 서버: broadcast에 origin(기기 ID + 커넥션 ID) 포함
  → 클라이언트: 자신의 기기/커넥션에서 온 메시지 무시
```

---

## 8. 에러 처리 및 재시도

### 8-1. 네트워크 에러

```
Push/Pull 요청 실패:
  1차: 1초 후 재시도
  2차: 2초 후 재시도
  3차: 4초 후 재시도
  4차: 8초 후 재시도
  5차: 16초 후 재시도
  → 5회 실패 후 사용자 알림
  
  앱 재시작 시 자동 재시도 (synced=0 항목 또는 pull_in_progress=1 감지)
```

### 8-2. 서버 에러 (401, 403 등)

```
401 Unauthorized (토큰 만료):
  → Refresh Token으로 Access Token 갱신
  → 요청 재시도
  → Refresh도 실패 → 재로그인 필요

400/422 Bad Request (데이터 오류):
  → 로컬 DB 수정하거나 해당 항목 스킵
  → 개발자 로그 남기기

500 Internal Server Error:
  → exponential backoff 재시도
  → 5회 이상 실패 시 개발자 알림
```

---

## 9. 체크리스트 및 검증

### 구현 시 확인 사항

- [ ] SQLite `synced` 플래그가 정확히 관리되는가?
- [ ] Push 응답 확인 전까지 synced=1 처리하지 않는가?
- [ ] Pull 청크/커서 로직이 중복/손실 없이 작동하는가?
- [ ] deleted_version 버전닝이 부활 방지 기능을 하는가?
- [ ] 강제 종료 후 복구가 안전한가? (pull_in_progress, lastPullCursor)
- [ ] 토큰 갱신 로직이 투명하게 작동하는가?
- [ ] exponential backoff 재시도가 제한되는가?

### 테스트 시나리오

1. **온라인 상태에서 메모 생성 → 동기화 확인**
2. **오프라인 상태에서 메모 생성 → 온라인 전환 → 동기화**
3. **동시 수정 (LWW 충돌 해결)**
4. **삭제 후 수정 (Tombstone 충돌 해결)**
5. **Pull 중 강제 종료 → 재시작 후 복구**
6. **Push 중 강제 종료 → 재시작 후 복구**
7. **토큰 만료 → Refresh 갱신 → 계속 동기화**

---

## 10. 참고 문서

- [API 엔드포인트](API.md) — `/api/sync/pull`, `/api/sync/push`
- [calendar-app-plan.md](../calendar-app-plan.md) — 섹션 5, 6
