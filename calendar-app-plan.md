# 내 캘린더 앱 — 최종 기획 문서

## 1. 배경 / 목표
기존 유료 구독형 데스크톱 캘린더(DesktopCal 등)의 클라우드 동기화 요금 대신,
직접 만들어 쓰는 개인용 캘린더. Windows 위젯 + 모바일 앱을 오프라인 상황을 포함해
안정적으로 쓸 수 있게 만드는 것이 핵심 목표.

## 2. 요구사항
1. Windows 데스크톱 위젯 + 모바일 앱(iOS/Android)
2. 온라인 상태일 때 실시간 동기화
3. 오프라인 상태에서도 마지막으로 동기화된 일정을 조회/수정 가능
4. 오프라인 → 온라인 전환 시, 오프라인 중 변경사항을 서버에 자동 반영

## 3. 확정된 결정 사항

| 항목 | 결정 |
|---|---|
| 백엔드 | Spring Boot + PostgreSQL |
| 실시간 통신 | WebSocket (STOMP) |
| 인증 | Google 소셜 로그인(OAuth2) + 자체 JWT 발급 |
| 데스크톱 클라이언트 | Electron (Windows 상주 위젯) |
| 모바일 클라이언트 | React Native (iOS/Android 공통 코드) |
| 클라이언트 로컬 저장소 | SQLite (기기별 오프라인 캐시 + 변경 큐) |
| 삭제 처리 | 소프트 삭제 (`deleted` 플래그, 실제 로우는 유지 = tombstone) |
| 충돌 처리 | Last-Write-Wins (`updatedAt` 기준 최신 값이 이김), DB 레벨 원자적 upsert로 구현 |
| 호스팅 | 집 PC / 홈서버 직접 운영 (DDNS + 리버스 프록시) |
| 알림 기능 | 1차 범위 제외, 차후 추가 |
| 공휴일 표시 | 공공데이터포털 특일 정보 API 연동, 백엔드가 캐싱 후 제공 |
| 데스크톱 위젯 배치 | 완전한 바탕화면 임베딩 아님. **항상 다른 창보다 z-order 최하단**에 위치 |

## 4. 데이터 모델

### User
| 필드 | 타입 | 설명 |
|---|---|---|
| id | UUID | PK |
| email | string | Google 계정 이메일 |
| googleSub | string | Google 계정 고유 식별자 |
| createdAt | timestamp | |

### Note (일정/메모)
| 필드 | 타입 | 설명 |
|---|---|---|
| id | UUID | PK (**클라이언트에서 생성** — 오프라인 생성 대비) |
| userId | UUID | FK → User |
| date | **LocalDate (순수 날짜, 타임존 변환 없음)** | 해당 날짜 |
| content | text | 메모 내용 |
| color | string | 표시 색상 |
| deleted | boolean | 소프트 삭제 여부 (tombstone) |
| updatedAt | timestamp (UTC, Instant) | 마지막 수정 시각 — 충돌 해결의 기준값 |

> **중요 — 타임존 함정**: `date`는 절대 `Instant`/`Timestamp`로 저장하지 말 것.
> 자정 근처 작성 시 타임존 변환 과정에서 날짜가 하루 밀리는 버그가 생김.
> `date`(순수 날짜)와 `updatedAt`(동기화용 시각)은 역할이 다르므로 타입도 명확히 분리.

> **id는 서버가 아니라 클라이언트(UUID)에서 생성**. 오프라인 중 새 일정을 만들 수 있어서
> 그 시점엔 서버가 ID를 줄 수 없음.

## 5. 동기화 프로토콜

### 5-1. API 엔드포인트
```
POST /api/auth/google          Google ID Token 검증 → 자체 JWT 발급
POST /api/auth/refresh         Refresh Token으로 Access Token 재발급

GET  /api/sync/pull?since={ts}&cursor={id}&limit=50
                               마지막 동기화 이후 서버 변경사항 조회 (Pull, 청크/커서 기반)
                               응답: {items: [...], nextCursor: "id", hasMore: bool, serverTime: "ts"}
POST /api/sync/push            로컬에서 밀린 변경사항 일괄 업로드 (Push, 배치)
                               요청: [{id, date, content, color, deleted, deleted_version}, ...]
                               응답: [{id, success: bool, error?: string}, ...]

GET  /api/holidays?year={yyyy} 해당 연도 공휴일 목록 (백엔드 캐시에서 제공)
```

### 5-2. 클라이언트 로컬 DB 스키마
```
notes 테이블:
  id, date, content, color, deleted, deleted_version (버전닝용, 기본값 0), updatedAt, synced (0|1)
  
sync_meta 테이블:
  lastSyncedAt (서버가 내려준 serverTime을 그대로 저장)
  lastPullCursor (부분 Pull 복구용, 마지막으로 성공한 항목 ID)
  pullInProgress (boolean, Pull 중 강제 종료 대비)
```
`synced=0`은 "로컬에서 바뀌었는데 아직 서버에 반영 안 된 변경"을 의미.
`deleted_version`은 Tombstone 버전닝용 — 삭제-수정 충돌 방지 (5-7, 6-2 참고).

### 5-3. 쓰기 경로 (사용자가 뭔가 수정할 때)
```
사용자 입력
  → 로컬 DB에 즉시 upsert (updatedAt = 지금, synced = 0)
  → 화면 즉시 갱신 (서버 응답을 기다리지 않음 — 항상 로컬 DB 기준으로 렌더링)
  → 온라인이면: 백그라운드로 즉시 Push 시도
  → 오프라인이면: synced=0 상태로 큐에 쌓아둠
```
삭제도 별도 로직이 아니라 `deleted=true, updatedAt=지금`으로 세팅하는 "수정"과 동일하게 처리.

### 5-4. 네트워크 상태 감지 및 동기화 트리거
동기화를 트리거하는 시점은 두 가지:
1. **오프라인 → 온라인 전환** (Electron: `navigator.onLine` + 주기적 ping / RN: `NetInfo`)
2. **앱이 백그라운드 → 포그라운드로 복귀** (RN: `AppState`) — 네트워크는 계속 연결돼 있었지만
   앱만 꺼져있던 경우를 놓치지 않기 위해 필요. 모바일 특유의 케이스.

### 5-5. 동기화 루틴 (Push → Pull, 항상 이 순서)
```
1) Push
   - synced=0인 로컬 로우들을 모아 POST /api/sync 전송
   - 서버는 개별 항목 단위로 성공/실패 응답 (배치 일부 실패해도 나머지는 반영)
   - 성공 응답받은 로우만 synced=1로 표시 (응답 확인 전엔 절대 synced=1 처리 금지 —
     응답 대기 중 앱이 강제 종료되는 경우 대비)

2) Pull (청크/커서 기반, 부분 실패 안전)
   - GET /api/sync/pull?since={lastSyncedAt}&cursor={lastPullCursor}&limit=50
   - 서버 응답:
     {
       items: [...최대 50개...],
       nextCursor: "item-id-999",     // 다음 청크 요청용 (없으면 null = 완료)
       serverTime: "2026-08-27T10:30:00Z",  // 이 배치의 확정 시간
       hasMore: false
     }
   - 클라이언트 처리:
     ① 수신한 items를 로컬 DB에 반영 (updatedAt 비교 후, 로컬이 더 최신이면 유지)
     ② lastPullCursor = nextCursor로 저장 (다음 Pull에서 이어서 요청)
     ③ hasMore=false이면 lastSyncedAt = serverTime으로 저장
     ④ 네트워크 끊기면? 재연결 시 마지막 cursor부터 다시 시작 → 중복/손실 없음

3) 부분 Pull 복구 (Pull 중 네트워크 끊김)
   - pullInProgress=true 상태로 시작
   - 각 청크 완료 후 lastPullCursor와 hasMore 저장 (배치 경계마다)
   - 강제 종료/재시작 후:
     ① lastPullCursor != null && hasMore=true → Pull 재개
     ② lastPullCursor가 없으면 → 새로 Pull 시작
```
Push를 먼저 하는 이유: 오프라인 중 만든 내 변경이 먼저 반영되어야, 이어지는 Pull에서
"내 변경까지 포함된" 완전한 최신 상태를 받아올 수 있음. 순서가 바뀌면 방금 만든 내용이
잠깐 사라졌다 나타나는 것처럼 보일 수 있음.

### 5-6. 실시간 반영 (온라인 유지 중, 앱이 열려있을 때)
```
로그인 성공 → WebSocket 연결 → /topic/notes/{userId} 구독

다른 기기가 Push로 서버에 저장
  → 서버가 해당 topic으로 변경된 로우 즉시 broadcast
  → 수신 기기: updatedAt 비교 후 더 최신이면 로컬 DB 즉시 반영, 화면 갱신
```
- WebSocket은 Push/Pull과 별개로 동작하는 **보조 채널**. 연결이 잠깐 끊겨도
  재연결 후 다음 Pull이 놓친 부분을 채워주므로 정합성은 깨지지 않음.
- **모바일 특이사항**: OS가 백그라운드 진입 시 소켓을 끊어버림 → 앱이 열려있을 때만
  실시간 반영이 의미 있고, 백그라운드/종료 상태의 공백은 다음에 앱을 켤 때
  Push+Pull이 한 번에 따라잡음. (FCM 기반 백그라운드 동기화는 1차 범위에서 제외,
  차후 확장 여지로만 남김)
- **에코 루프 방지**: broadcast 메시지에 origin(발신 기기/커넥션) 식별자를 포함시켜서,
  자기 자신이 보낸 변경을 다시 받았을 때는 무시하도록 처리.

### 5-7. 충돌 해결 (서버 측, 원자적 upsert, 서버 시각 기반)
읽고→비교→쓰기를 애플리케이션 코드에서 분리하면 레이스 컨디션이 생기므로,
**하나의 원자적 SQL 문**으로 처리. 그리고 **클라이언트 시계 오차를 배제하기 위해
서버가 updatedAt을 발급**:

```sql
-- 클라이언트는 content, color, deleted만 보냄 (updatedAt 제외)
INSERT INTO notes (id, user_id, date, content, color, deleted, deleted_version, updated_at)
VALUES (:id, :userId, :date, :content, :color, :deleted, :deletedVersion, NOW())
ON CONFLICT (id)
DO UPDATE SET
    content = EXCLUDED.content,
    color = EXCLUDED.color,
    deleted = EXCLUDED.deleted,
    deleted_version = CASE
        WHEN EXCLUDED.deleted = true AND notes.deleted = false THEN notes.deleted_version + 1
        WHEN EXCLUDED.deleted = false AND notes.deleted = true THEN EXCLUDED.deleted_version
        ELSE notes.deleted_version
    END,
    updated_at = NOW()
WHERE notes.updated_at < NOW();
```

**핵심 변화:**
- 클라이언트는 `updatedAt`을 보내지 않음 (시계 오차 배제)
- 서버가 모든 쓰기에 현재 시각을 찍음 (LWW의 근거가 서버 시각)
- `deleted_version`: Tombstone 버전닝으로 삭제-수정 충돌 방지 (6-2 참고)
  * 삭제 → 수정 순서: `deleted_version` 증가 후 `deleted=false`로 덮어씌워짐 (부활은 방지)
  * 수정 → 삭제 순서: 이전 `deleted_version` 유지하고 `deleted=true` (정상 동작)

**레이스 컨디션 방지:**
- 두 요청이 동시에 와도 DB가 같은 로우에 대한 쓰기를 직렬화하므로 결과는 항상 결정적
- Spring Data JPA의 `save()`는 이 조건부 upsert를 지원하지 않으므로, 이 부분만
  `@Query(nativeQuery = true)` 또는 `JdbcTemplate`으로 직접 구현

**트레이드오프:**
- 오프라인 중 수정한 항목의 updatedAt이 "온라인 복귀 후 동기화 시각"으로 기록됨
- 사용자 입장에선 "방금 수정했는데 왜 지금 시각으로 뜨지?"할 수 있음
- 하지만 데이터 정합성과 예측 가능성을 위해 필요한 트레이드오프

**충돌 예시**
```
노트북(오프라인): "회의 3시" (updatedAt 09:00) → 먼저 온라인 → Push → 서버에 저장
폰(오프라인):     "회의 4시로 변경" (updatedAt 09:05) → 나중에 온라인 → Push
                  → 09:05 > 09:00 이므로 서버 값이 폰 내용으로 갱신됨
노트북: 다음 Pull 때 "회의 4시로 변경"을 받아 자동 반영
```
더 나중에 수정한 쪽이 최종적으로 이기며, 사용자 개입 없이 자동 정리됨.

## 6. 알려진 한계 / 예외 케이스

### 6-1. 로직으로 완전히 해결됨
- **동시 Push 레이스 컨디션** → 5-7의 원자적 upsert로 해결.

### 6-2. 설계로 방지 필요 (구현 시 반드시 챙길 것)
| 이슈 | 대응 |
|---|---|
| 타임존 문제 | `date`(순수 날짜)와 `updatedAt`(UTC 시각, 서버 발급) 타입을 명확히 분리 |
| **[신규] Pull 부분 실패 + 상태 추적** | 청크/커서 기반 Pull (5-5 참고). 각 청크마다 lastPullCursor 저장 → 재시도 시 마지막 완료한 청크부터 시작. 강제 종료 대비: pullInProgress 플래그와 lastPullCursor 영속화 |
| **[신규] 클라이언트 시계 오차** | 클라이언트는 updatedAt을 보내지 않음 (5-7 참고). 서버가 모든 쓰기에 NOW() 찍기 → LWW의 근거를 서버 시각으로 통일. 클라이언트 시계 틀어짐 무시 가능 |
| **[신규] Tombstone(삭제) + 수정 충돌** | `deleted_version` 필드 추가 (5-7 참고). 삭제 시 버전 증가, 수정은 deleted=false인 항목에만 허용. UI: 삭제된 항목은 "복구" 버튼으로만 활성화 가능 (수정 버튼 비활성화) |
| 장기 오프라인 후 JWT 만료 | Refresh Token 도입. Refresh도 만료 시 재로그인(Google OAuth) 유도. 로그아웃 시 로컬 DB와 Push 큐 완전 초기화 |
| WebSocket 에코 루프 | broadcast 메시지에 **기기 ID + 커넥션 ID** 조합으로 origin 식별자 포함, 자기 발신 건 무시. 멀티 창/탭도 각각 다른 커넥션 ID 보유 |
| Push 배치 부분 실패 | 배치 전체가 아니라 **개별 항목 단위**로 성공/실패 응답. 실패한 항목은 exponential backoff로 재시도 (로컬 큐 유지) |
| 인터넷은 되는데 홈서버만 다운 | 단순 `navigator.onLine` 신뢰 금지, API 호출 실패 시 지수 백오프 재시도. 재시도 중 앱 강제 종료 시: 진행 중인 Push 항목 목록을 persistent storage에 저장, 재시작 시 복구 |
| 로그아웃 후 다른 계정 로그인 | 로그아웃 시 로컬 DB, Push 큐, Pull cursor 모두 완전 초기화 (계정 간 데이터 혼입 방지) |
| 신규 기기 최초 로그인 | `lastSyncedAt` 없음 → 사실상 전체 Pull (청크/커서로 진행). 데이터 많으면 시간 소요, 진행률 표시 권장. 강제 종료 후 재시작 시: lastPullCursor 복구로 이어서 진행 |
| 서버 시계 < 클라이언트 시계 | Pull 응답의 serverTime이 이전 lastSyncedAt보다 작으면 이상 신호 (클라이언트 경고 또는 로그). 서버 NTP 동기화 확인 필요 |

### 6-3. 구조적 한계로 감안하고 갈 것
| 이슈 | 설명 |
|---|---|
| **[해결됨] 클라이언트 시계 오차** | **⬆️ 5-7에서 서버 발급 updatedAt으로 완벽 해결됨. 이제 감안할 한계가 아님.** |
| **[해결됨] 삭제 vs 수정 충돌** | **⬆️ 6-2의 Tombstone 버전닝으로 해결됨. 삭제된 항목의 부활/손실 문제 제거. 이제 감안할 한계가 아님.** |
| Tombstone(삭제 기록) 메모리 압박 | `deleted_version` 기반 Tombstone은 영구 보관 (복구 불가를 보장하기 위해). 개인용이어도 5년 × 365일 × 10개/일 = 약 18,250개 tombstone 누적 가능. 초기엔 정리 안 하는 것 권장. 1년 이후 운영 데이터 기반으로 정리 정책 재평가 (구현 우선도: 낮음) |
| Pull 중 앱 강제 종료의 복구 여부 | lastPullCursor와 pullInProgress 플래그 영속화로 복구 가능하게 설계함 (5-5, 6-2 참고). 완벽한 원자성은 아니지만 데이터 손실/중복 위험 극소화. 구현 시 꼼꼼히 테스트 필요 |
| 서버 시계 불일치 | 클라이언트와 서버의 시계가 크게 차이나면 (예: 서버가 몇 시간 뒤로 감), serverTime이 이전 lastSyncedAt보다 작아질 수 있음. 감지 로직 필요 (6-2 참고), 근본 해결은 서버 NTP 동기화 |

## 7. 홈서버 호스팅 관련 설계

| 이슈 | 대응 방안 |
|---|---|
| 공인 IP가 자주 바뀜 (유동 IP) | DDNS (DuckDNS, No-IP 등) 로 도메인 고정 |
| 외부에서 집 서버 접속 필요 | 공유기 포트포워딩 (예: 443 → 내부 8080) |
| HTTPS 필요 (모바일 OS 정책) | Caddy 또는 Nginx + Let's Encrypt 리버스 프록시 |
| WebSocket도 프록시 통과 필요 | `Upgrade`/`Connection` 헤더 프록시 설정 |
| 인터넷 노출 → 보안 | JWT 인증 필수, 불필요 포트 차단, 정기 OS/패키지 업데이트 |
| 집 PC 꺼지면 서비스 다운 | 가능하면 저전력 미니PC/라즈베리파이를 상시 가동 추천 |

## 8. 로그인 설계 (Google OAuth2)
1. 클라이언트가 시스템 브라우저로 Google 로그인 화면 표시
   - Electron: 기본 브라우저 오픈 + 로컬 loopback 서버(`http://localhost:{port}/callback`)로 리다이렉트 수신
   - React Native: `expo-auth-session` 또는 `@react-native-google-signin/google-signin`
2. Google ID Token을 백엔드로 전달 (`POST /api/auth/google`)
3. 백엔드가 Google 공개키로 검증 → 이메일 확인 → 최초 로그인 시 User 생성
4. 백엔드가 **자체 Access/Refresh JWT** 발급, 이후 API 호출은 이 토큰 사용

## 9. 공휴일 자동 표시 설계
- 공공데이터포털 특일 정보 API(대체공휴일 포함, 한국 기준 정확) 사용
- 클라이언트가 직접 외부 API를 부르지 않고, **백엔드가 연 단위로 미리 가져와 DB 캐싱**
  → `GET /api/holidays?year=2026`으로 클라이언트에 제공
- 이유: API 키 노출 방지 / 오프라인 클라이언트도 한 번 받은 공휴일은 로컬 캐시로 계속 조회 가능 /
  외부 API 장애가 앱 전체에 영향 주지 않음
- 갱신 주기: 연 1회(연초) 배치로 충분

## 10. 클라이언트 아키텍처

### Electron (Windows 위젯)
- Main process: 창 관리, 로컬 SQLite 접근, 동기화 스케줄러
- Renderer: 캘린더 UI, 로컬 DB 구독해서 실시간 리렌더
- **"항상 맨 아래" 배치**: `alwaysOnTop` 미사용. 창이 `blur`(포커스 이탈) 이벤트를 받을 때마다
  `koffi`로 `user32.dll`의 `SetWindowPos(hwnd, HWND_BOTTOM, ...)` 호출해 z-order 최하단으로 내림.
  메모 입력을 위해 클릭해서 포커스를 얻은 동안엔 정상적으로 앞에 나타났다가, 포커스를
  잃으면 다시 맨 아래로 내려감. WorkerW 재부모화 같은 비공식 트릭보다 안정적(표준 API 사용).
- 네트워크 상태 감지 + 동기화 스케줄러는 5-4/5-5 로직을 그대로 구현

### React Native (모바일)
- 로컬 DB: SQLite (예: op-sqlite)
- 동기화 로직(sync-core)은 Electron과 최대한 동일한 형태의 순수 JS 모듈로 분리해서
  두 프로젝트에서 재사용 고려
- 동기화 트리거: `NetInfo`(온라인 전환) + `AppState`(포그라운드 복귀) 둘 다 필요 (5-4 참고)
- WebSocket은 앱이 포그라운드일 때만 유지, 백그라운드 진입 시 OS가 끊음 → 복귀 시
  Push+Pull로 공백을 자동 보충

## 11. 개발 순서(제안)

### Phase 1: 핵심 동기화 설계 구현 (버그 방지)
1. **백엔드 DB 스키마** (중요: 5-7의 `deleted_version` + 원자적 upsert 포함)
   - users, notes 테이블 (deleted_version 필드 추가)
   - 서버는 모든 쓰기에 NOW() 찍기
   
2. **백엔드 API** (5-1 참고)
   - POST /api/auth/google, /auth/refresh
   - GET /api/sync/pull?since={ts}&cursor={id}&limit=50 (청크/커서 기반)
   - POST /api/sync/push (개별 항목 성공/실패 응답)
   - GET /api/holidays?year={yyyy}

3. **Electron 클라이언트 (로컬 전용)**
   - SQLite 로컬 DB (notes + sync_meta 테이블, 5-2 참고)
   - 오프라인 CRUD (synced=0 플래그 관리)
   - 네트워크 상태 감지 (navigator.onLine + ping)

4. **Electron ↔ 백엔드 동기화 (핵심)**
   - Push/Pull 구현 (5-5의 청크/커서 방식)
   - lastPullCursor 영속화 (부분 실패 복구)
   - pullInProgress 플래그 (강제 종료 대비)
   - deleted_version 필드 처리
   - **이 단계에서 설계 결함을 가장 먼저 검증**

### Phase 2: 실시간 + 모바일
5. **WebSocket 실시간 반영** (5-6)
   - 기기 ID + 커넥션 ID로 에코 루프 방지
   - 이미 Push한 항목이 broadcast로 돌아오면 무시

6. **React Native 클라이언트**
   - sync-core 로직을 Electron과 공유 (순수 JS 모듈)
   - NetInfo (온라인 전환) + AppState (포그라운드 복귀) 트리거
   - 배경 동기화 재시도 로직

### Phase 3: 배포 + 운영
7. **홈서버 배포** (DDNS + 리버스 프록시 + HTTPS)
8. **운영 모니터링** (1년 후 Tombstone 정리 정책 수립)

## 12. 아직 열려 있는 질문 / 구현 시 검증 항목

### 설계 검증 (구현 전 필수)
- [ ] Pull 청크/커서 메커니즘 구현 시 중복/손실 없는지 실제 부분 실패 시나리오로 테스트
- [ ] deleted_version 필드 추가로 인한 DB 마이그레이션 계획 (기존 항목 초기값 = 0)
- [ ] 서버가 updatedAt을 발급하면, 오프라인 중 수정한 항목의 타임스탬프 UX가 문제 없는지 확인
- [ ] WebSocket 메시지에 기기 ID + 커넥션 ID 포함 시, 멀티 창/탭 환경에서 에코 루프 방지 확인

### 외부 의존성
- [ ] 공공데이터포털 API 키 발급 절차 — 개발 시작 전 미리 신청 필요 (승인까지 시간 소요 가능)
- [ ] Google OAuth 클라이언트 등록 시 Electron/RN 각각에 맞는 리다이렉트 URI 설정

### 구현 상 고려 사항
- [ ] Electron "맨 아래 고정" 로직(SetWindowPos)의 실제 클릭/포커스 전환 타이밍 이슈 → 실기기 테스트 필수
- [ ] Pull 중 강제 종료 후 복구 시뮬레이션 (lastPullCursor 영속화 동작 확인)
- [ ] Tombstone 메모리 증가 추적 (1년 운영 후 정리 정책 재검토)

---

## 13. 변경 이력 (2026-08-27 검증 업데이트)

### 🔧 수정된 세 가지 핵심 설계 결함

#### 1️⃣ **Pull 부분 실패 안전성** (5-2, 5-5 업데이트)
- **문제:** 100개 항목을 Pull 중 네트워크 끊김 → 60개만 받은 후 상태 불명확
- **해결:** 청크/커서 기반 Pull (최대 50개/청크)
  * 각 청크마다 `lastPullCursor` 저장 → 재시도 시 마지막 완료 지점부터 시작
  * 부분 Pull 중 강제 종료 대비: `pullInProgress` 플래그 + cursor 영속화
  * 중복/손실 없이 복구 가능

#### 2️⃣ **클라이언트 시계 오차 제거** (5-7 완전 재설계)
- **문제:** 기기 A의 시계가 +1시간 틀어지면, A의 "과거" 수정이 B의 최신 수정을 덮어씌움
- **해결:** 서버가 모든 쓰기에 `NOW()` 찍기 (클라이언트 updatedAt 전송 금지)
  * LWW의 근거를 서버 시각으로 통일
  * 클라이언트 시계 오차 완벽 배제
  * 트레이드오프: 오프라인 중 수정한 항목의 updatedAt이 "동기화 시각"으로 기록 (허용 가능)

#### 3️⃣ **Tombstone 버전닝으로 삭제-수정 충돌 해결** (5-7, 6-2, 6-3 업데이트)
- **문제:** 기기 A에서 항목 삭제, 기기 B에서 같은 항목 수정 → LWW로는 부활/손실 가능
- **해결:** `deleted_version` 필드 추가
  * 삭제 시: `deleted_version` 증가, `deleted=true`
  * 수정 시: `deleted=false`인 항목에만 허용 (UI: 수정 버튼 비활성화)
  * 버전닝으로 의미적 충돌 논리적으로 불가능

### 📝 섹션별 변경 내역
- **5-1:** API 엔드포인트 경로 변경 (`/api/sync` → `/api/sync/pull`, `/api/sync/push`)
- **5-2:** `sync_meta` 테이블에 `lastPullCursor`, `pullInProgress` 추가
- **5-5:** Pull 프로토콜 완전 재설계 (청크/커서, 부분 실패 복구)
- **5-7:** 원자적 upsert에 `deleted_version` 로직 추가, 서버 updatedAt 발급
- **6-2:** 3가지 신규 항목 추가 + 기존 항목들 정제
- **6-3:** "알려진 한계" 중 2가지 해결됨 명시 (시계 오차, 삭제-수정 충돌)
- **11:** 개발 순서 3단계로 정리 (Phase 1: 핵심 동기화, Phase 2: 실시간+모바일, Phase 3: 배포)
- **12:** 검증 체크리스트 및 변경 이력 추가
