# 03. 프로토콜

서버 구현은 `server/src/sync.ts`·`server/src/auth.ts`, 클라이언트 구현은 `web/src/sync/engine.ts`.
서버와 클라이언트가 함께 쓰는 타입·상수는 `server/src/protocol.ts` 한 곳에 있다(web이 직접 import, 런타임 의존성 없음).

## 0. 엔드포인트 한눈에

| 경로 | 인증 | 용도 |
|---|---|---|
| `GET /healthz` | 없음 | 상태 확인 |
| `GET /about` · `/privacy` · `/terms` | 없음 | 소개(Google 동의 화면의 홈페이지)·개인정보처리방침·이용약관. 스타일은 `/pages.css` |
| `GET /google….html` | 없음 | `GOOGLE_SITE_VERIFICATION`을 넣었을 때만. Search Console 소유권 확인 |
| `GET /.well-known/assetlinks.json` | 없음 | Android TWA 서명 지문 (D-008) |
| `GET /auth/google/start` | 없음 | Google 로그인 시작 |
| `GET /auth/google/callback` | 없음 | Google 로그인 콜백 |
| `POST /api/auth/desktop/exchange` | 없음 (PKCE) | 윈도우 앱 일회용 코드 → 기기 토큰 |
| `GET /api/me` | 필요 | 로그인한 사용자 `{email, device, admin, usage, quota}` |
| `DELETE /api/account` | 필요 | 계정 삭제 `{email}` (본인 이메일 확인, D-020) |
| `POST /api/auth/logout` | 필요 | 로그아웃 (이 기기 토큰 폐기) |
| `GET /api/devices` · `DELETE /api/devices/:id` | 필요 | 내 기기 목록 · 폐기 (남의 기기는 404) |
| `POST /api/ws-ticket` | 필요 | WebSocket 일회용 티켓 (30초) |
| `POST /api/sync/push` | 필요 | op 보내기 (2.1) |
| `GET /api/sync/pull?since=N` | 필요 | 변경 받기 (2.3) |
| `GET /api/notes/:date/history` | 필요 | 칸 이력 |
| `GET /api/holidays` | 필요 | 공휴일 (고정 + 임시) |
| `POST /api/holidays` · `DELETE /api/holidays/:date` | `ADMIN_EMAILS` | 임시공휴일 추가 · 삭제 |
| `GET /api/export` · `POST /api/import` | 필요 | JSON 내보내기 · 가져오기 (6절) |
| `GET /api/admin/stats` | `ADMIN_EMAILS` | 관리자 통계: 합계, 최근 30일 날짜별 저장·가입, 사용자별 숫자, 서버 상태. 메모 내용 없음 (D-021) |
| `GET /admin` | 없음 (화면만) | 관리자 화면. 데이터는 위 API 로 받으므로 관리자 세션 쿠키가 있어야 보인다 |
| `WS /api/ws?ticket=` | 티켓 | 실시간 이벤트 (2.4) |

인증이 필요한 요청은 모두 토큰의 사용자 달력만 다룬다(D-015).

요청에 `X-Deskcal-User: <캐시 주인 이메일>`이 있으면 서버는 토큰의 계정과 비교해 다르면 `409 {error:'account changed'}`로 거부한다. `/api/me`에는 이 헤더를 보내지 않는다(계정 확인용). 허용 목록에서 빠진 이메일의 토큰은 401.

그 밖의 화면 경로는 `index.html`을 돌려준다. `/api`·`/auth`·`/assets`·`/icons` 아래와 확장자가 있는 경로는 없으면 404.

## 0.1 제한값

| 항목 | 값 | 위치 |
|---|---|---|
| 메모 한 칸 | 64KB (`MAX_NOTE_BYTES`) | `protocol.ts` |
| push 한 번의 op 수 | 200 (`MAX_OPS_PER_PUSH`) | `protocol.ts` |
| push 요청 크기 | 4MB | `app.ts` |
| 가져오기 요청 크기 | 10MB | `dataRoutes.ts` |
| 그 밖의 요청 크기 | 256KB | `app.ts` |
| 클라이언트가 한 번에 보내는 op | 50 (`PUSH_BATCH`) | `engine.ts` |
| pull 한 페이지 | 1000칸 | `sync.ts` |
| WebSocket 메시지 크기 | 64KB | `app.ts` |
| WebSocket ping | 30초마다 (Funnel 유휴 끊김 방지, 죽은 연결 정리) | `app.ts` |
| 색 | `red` `orange` `yellow` `green` `blue` `purple` `gray` 또는 없음 | `protocol.ts` |

관리자가 아닌 사용자에게만 (D-017, D-018):

| 항목 | 기본값 | 넘으면 |
|---|---|---|
| 가입 인원 (`MAX_USERS`, 누구나 가입일 때만) | 50명 | 새 계정 로그인 403 "새 사용자를 받을 수 없습니다" |
| 메모 용량 (`USER_QUOTA_MB`) | 10MB (내용 바이트 + 칸마다 100) | 메모를 키우는 op 는 `rejected` "저장 공간이 가득 찼습니다". 줄이거나 지우는 op 는 받음 |
| 이력 용량 (`USER_QUOTA_MB`) | 10MB | 그 사용자의 가장 오래된 이력부터 지움 |
| op 속도 (`OPS_PER_MINUTE`) | 1분 600개 (토큰 버킷) | push·가져오기 429. 클라이언트는 연결을 끊고 백오프 후 다시 보냄 |

## 1. 인증

### 1.1 웹·PWA·Android

1. `Google 계정으로 로그인` → 서버가 state·PKCE를 만들고 브라우저 바인딩 쿠키를 심은 뒤 Google로 보낸다
2. Google이 `PUBLIC_URL/auth/google/callback`으로 돌려보낸다
3. 서버가 이메일이 `ALLOWED_EMAILS`에 있는지(`*`면 누구나) 확인하고, 처음이면 사용자를 만든 뒤(가입 인원 한도) 세션 쿠키 `dc_session`(`HttpOnly; Secure; SameSite=Strict`, 400일)을 준다

OAuth state는 10분 동안만 유효하다(쿠키 `dc_oauth`). 세션 쿠키 값도 기기 토큰이라 1.3의 만료·폐기 규칙을 그대로 따른다.

### 1.2 윈도우 앱 (D-003)

1. 앱이 시스템 브라우저로 서버 로그인 페이지를 연다
2. 로그인이 끝나면 서버가 `127.0.0.1` 루프백으로 일회용 코드를 돌려준다 (2분 유효)
3. 이 코드는 PKCE(S256)로 묶여 있어서 앱만 `POST /api/auth/desktop/exchange`로 기기 토큰으로 바꿀 수 있다
4. 앱은 기기 토큰을 DPAPI로 암호화해 저장하고 `Authorization` 헤더로 쓴다

Google 쪽에는 웹 애플리케이션 클라이언트 하나만 있으면 된다.

### 1.3 기기 토큰

- 256비트 랜덤. DB에는 SHA-256만 저장한다
- 90일 동안 쓰지 않으면 만료된다. 설정의 기기 목록에서 폐기할 수 있다

## 2. 동기화 API

### 2.1 보내기

`POST /api/sync/push {ops:[{opId, date, baseVersion, content?, color?, resolveConflict?}]}`

응답은 op마다 `{opId, status, note?, seq?, error?}`. `status`는 `applied` · `merged`(충돌 병합) · `duplicate` · `rejected`(형식 오류 등) 중 하나다.

- `opId`는 UUID, `date`는 실제로 있는 날짜(`YYYY-MM-DD`)여야 한다
- `content`·`color`는 바뀐 경우에만 보낸다. 없으면 그대로 둔다. `color: null`은 색 없음
- `kind`(`edit` / `restore`)는 이력 표시용이다
- 이미 처리한 `opId` → `duplicate` (같은 결과, 다시 반영하지 않음)
- `baseVersion == version` → 덮어쓰고 `version+1`, 그 사용자의 변경 번호 발급, 그 사용자의 기기들에 WebSocket 으로 방송
- 남의 사용자가 이미 쓴 `opId` → `rejected` (응답을 돌려주지 않음)
- 다르면 → **충돌** (2.2)
- 색은 마지막에 쓴 쪽이 이긴다. 색만 바꾼 op 는 내용 충돌을 만들지 않는다

### 2.2 충돌 (D-009)

- `서버 내용 + "--- 다른 기기에서 수정 ---" + 내 내용` 으로 합치고 충돌 표시를 켠다
- 합치기 전 두 버전은 모두 이력에 남는다(`conflict_client` 와 직전 버전)
- 구분선을 지우고 저장하거나 "충돌 표시 해제"(`resolveConflict`)를 누르면 충돌 표시가 풀린다

### 2.3 받기

`GET /api/sync/pull?since=N` → `{notes, lastSeq, more, reset?}`. 내 달력에서 그 뒤로 바뀐 날짜들의 최신 상태를 1000칸씩 준다. `seq`는 사용자마다 따로 센다(D-016). `more`가 참이면 `since=lastSeq`로 이어서 받는다. 클라이언트의 `since` 가 서버보다 크면 `reset`.

### 2.4 실시간

`WS /api/ws?ticket=...`. 티켓은 인증된 요청으로 받는 30초짜리 일회용이고, handshake 에서 검사한다(Origin도 검사). 서버 → 클라이언트 이벤트만 있고, 클라이언트가 보내는 메시지는 무시한다.

| 이벤트 | 뜻 |
|---|---|
| `{type:'hello', lastSeq}` | 연결 직후. 내 달력의 마지막 변경 번호. 클라이언트가 놓친 게 있는지 판단한다 |
| `{type:'note', seq, note}` | 내 달력의 칸 하나가 바뀜 (같은 사용자의 기기에만 감) |
| `{type:'holidays'}` | 임시공휴일이 바뀜 → 공휴일을 다시 받는다 (모든 사용자에게 감) |

## 3. 클라이언트 큐

편집하면 `{opId, date, baseVersion, 새 내용}` 을 디스크(IndexedDB / 파일)에 먼저 저장하고 나서 보낸다.

- 같은 날짜를 오프라인에서 여러 번 고치면 하나로 합친다
- 이미 전송을 시도한 항목은 같은 opId 로만 재전송하고 내용을 바꾸지 않는다. 그 뒤의 수정은 새 항목으로 쌓았다가, 앞 항목의 응답 `version` 을 base 로 이어서 보낸다
- 편집 시작 시점의 version 을 base 로 써서, 편집하는 사이 다른 기기의 수정을 조용히 덮어쓰지 않는다
- 큐가 남아 있으면 오른쪽 위에 `오프라인 · 대기 N`으로 표시한다

### 3.1 계정이 바뀌었을 때 (D-015)

- 캐시에 주인 계정(`owner`)을 함께 저장하고, 모든 요청에 `X-Deskcal-User`로 보낸다
- 앱을 시작하거나 로그인하면 `/api/me`로 계정을 확인한다. 주인과 다르면 캐시·큐를 비우고 새 계정으로 처음부터 받는다(미전송 수정은 버리고 개수를 알린다)
- 다른 탭에서 다른 계정으로 로그인해 쿠키가 바뀌면 서버가 409를 준다 → 엔진을 멈추고 화면을 다시 불러와 위 확인을 한다. 그래서 이전 계정의 큐가 새 계정 달력으로 가지 않는다
- 예전 버전 캐시(`owner` 없음)는 처음 확인한 계정을 주인으로 삼는다

## 4. 재연결 순서

1. WebSocket 연결 (이벤트는 버퍼)
2. 큐 전송
3. `since=lastSeq` 로 놓친 변경분 받기
4. 버퍼 이벤트 중 새것만 적용

- 이벤트 번호에 빈 곳이 보이면 바로 `since` 조회한다
- 끊기면 지수 백오프(1초 → 최대 60초, 0.5~1배 무작위 지터)로 재연결하고, 네트워크 복구·화면 다시 보임 이벤트가 오면 즉시 재연결한다
- 폴링은 하지 않는다 (D-012)

## 5. 백업 복원 뒤

복원하면 서버의 `seq`(사용자별)가 뒤로 돌아간다. 각 기기는 다시 연결될 때 `since`가 서버보다 큰 것을 보고(`reset`) 달력을 처음부터 다시 받는다. 기기에 남아 있던 미전송 수정은 그대로 다시 보낸다.

## 6. JSON 내보내기·가져오기 (D-011)

- 내보내기: 내 달력 전체를 JSON 파일로 받는다 (임시공휴일 목록도 들어간다)
- 가져오기: 내 달력에서 파일에 있는 날짜만 덮어쓴다. 덮어쓴 칸은 이력에 남아 되돌릴 수 있다. 용량·속도 제한을 받는다
- 파일의 임시공휴일은 관리자일 때만 가져온다 (D-019)
