# 02. 아키텍처

## 전체 구조

```
윈도우 앱 / 휴대폰 ──HTTPS·WebSocket──▶ Tailscale Funnel ──▶ 서버(127.0.0.1:3000) ──▶ MariaDB(127.0.0.1:3306)
```

### 편집 한 번의 흐름

1. 칸을 고치면 클라이언트가 `{opId, date, baseVersion, 새 내용}`을 디스크 큐(IndexedDB / 파일)에 먼저 저장한다
2. `POST /api/sync/push`로 보낸다
3. 서버가 그 사용자의 `users` 행을 잠그고 반영(또는 충돌 병합)한 뒤 그 사용자의 `seq`를 발급하고, 이력을 남긴다
4. 서버가 WebSocket으로 같은 사용자의 다른 기기에 `{type:'note', seq, note}`를 보낸다
5. 응답을 받은 클라이언트는 큐에서 그 op를 지운다

자세한 규칙은 03-protocol.

## 레포 구조

```
server/            Fastify + mysql2 (TypeScript). esbuild 로 단일 파일 번들 → Docker
  migrations/      postgrator SQL 마이그레이션 (시작 시 자동 적용)
  src/sync.ts      op 적용·충돌 병합·이력·since 조회·저장 용량
  src/users.ts     사용자 만들기·기존 달력 넘겨받기·계정 삭제
  src/auth.ts      Google OAuth(PKCE), 기기 토큰, 로그인 시도 제한, op 속도 제한, X-Forwarded-For
  src/pages.ts     공개 페이지: 소개(/about)·이용약관(/terms)·공통 레이아웃
  src/admin.ts     관리자 통계 (/api/admin/stats)
  src/privacy.ts   개인정보처리방침 (/privacy)
  src/backup.ts    매일 mariadb-dump 백업
web/               바닐라 TypeScript + Vite. PWA 와 Tauri 가 같은 코드를 씀
  admin.html, src/admin.ts  관리자 화면 (/admin, 달력과 별도 번들, 오프라인 캐시에 넣지 않음)
  src/sync/engine.ts  오프라인 큐 + 캐시 + WebSocket 재연결 (DOM 없음, Node 테스트 가능)
desktop/src-tauri/ Tauri v2 (Rust): 바탕화면 부착(Win32), 트레이, 자동 실행, 파일 저장소, DPAPI
android/           TWA 앱 (패키지 io.github.toddla23.batangcalendar)
data/holidays-kr.json  2025~2030 공휴일
```

## 기술 스택

| 부분 | 선택 | 이유 |
|---|---|---|
| 서버 | Node.js + Fastify | 메모리가 적게 들고, ARM64에서 네이티브 모듈 없이 돈다. esbuild로 의존성까지 한 파일로 묶어 `node_modules` 없이 배포한다 (D-005) |
| DB | MariaDB (파이에 설치된 것) | utf8mb4 |
| 프론트엔드 | 바닐라 TS + Vite | 달을 바꿀 때만 42칸을 만들고, 이후에는 바뀐 칸만 다시 그린다 (D-006) |
| 데스크톱 | Tauri v2 | 시스템 WebView2를 써서 설치 파일이 작다 (D-007) |
| Android | TWA | 웹앱과 같은 화면, 서버를 업데이트하면 앱도 바뀐다 (D-008) |

## DB 스키마 (utf8mb4)

| 표 | 용도 |
|---|---|
| `users` | 사용자(이메일), 마지막 변경 번호 `last_seq`, 저장 용량 `note_bytes`·`history_bytes`. 모든 쓰기 트랜잭션이 자기 행을 잠가 사용자별로 직렬화 → `seq` 순서와 커밋 순서가 같아서 `since` 조회에서 빠지는 변경이 없음 (D-016) |
| `notes` | `(user_id, date)`별 현재 내용·색·`version`·충돌 표시 |
| `changes` | `(user_id, seq)`. 날짜별 마지막 변경 번호만 남김. `since=` 조회와 실시간 이벤트 순서의 기준 |
| `note_history` | 사용자·날짜 칸별 이력 (최근 `HISTORY_KEEP`개, 기본 100, D-010. 관리자가 아니면 용량 한도도, D-018) |
| `applied_ops` | 처리한 `opId`·사용자·응답. 재전송된 op 는 저장된 응답을 그대로 돌려줌. 남의 opId 는 거부 (90일 후 정리) |
| `custom_holidays` | 직접 추가한 임시공휴일 (모든 사용자 공통, D-019) |
| `devices` | 기기별 토큰의 SHA-256 해시, 사용자, 마지막 사용 시각(90일 미사용 시 만료), 폐기 시각 |

- 002 마이그레이션 전 데이터는 `users.id=1`(이메일 빈 값)로 옮겨지고, 서버가 시작할 때 `ADMIN_EMAILS` 첫 번째 이메일에 넘겨준다. 기존 기기 토큰은 이메일로 사용자에 연결된다(D-015).

## 클라이언트 저장

- **웹·PWA·Android**: 캐시와 큐를 IndexedDB에 둔다.
- 캐시에는 주인 계정(`owner`)이 같이 저장된다. 로그인한 계정이 다르면 캐시와 큐를 비운다(D-015, 03-protocol 3절).
- **윈도우 앱**: 캐시·큐·설정을 `%LOCALAPPDATA%\dev.selfhosted.batangcalendar\`에 JSON 파일로 둔다. 쓰기는 임시 파일 + 이름 바꾸기라서 도중에 꺼져도 깨지지 않는다. 로그인 토큰은 Windows DPAPI로 암호화해 `token.bin`에 둔다.

## 윈도우 앱 표시 방식

| 방식 | 동작 |
|---|---|
| 바탕화면에 붙이기 (기본) | 바탕화면 아이콘 레이어(`Progman`/`WorkerW` 안의 `SHELLDLL_DefView` 호스트)의 자식 창으로 붙는다. Win+D를 눌러도 보인다. 편집하는 동안만 잠시 떼어 내서 키보드 입력을 받고, 끝나면 다시 붙는다. 붙이지 못하면 자동으로 "항상 아래"로 바뀐다 |
| 항상 다른 창 아래 | 일반 창이지만 항상 맨 아래에 있다 |
| 일반 창 | 보통 창처럼 동작한다 |

창은 테두리가 없고 작업표시줄에 나타나지 않는다. 불투명도가 60% 미만이면 글자에 그림자를 넣어 바탕화면 위에서도 읽히게 한다.

웹 코드가 부르는 Tauri 명령(`desktop/src-tauri/src/`):

| 명령 | 하는 일 |
|---|---|
| `google_login` | 시스템 브라우저 + 루프백으로 로그인 (03-protocol 1.2) |
| `set_locked` | 위치·크기 잠금 |
| `autostart_get` · `autostart_set` | 윈도우 시작 시 자동 실행 |
| `app_ready` | 화면 준비가 끝나면 창을 보인다 |
| `host_name` | 기기 이름 (기기 목록 표시용) |

웹 쪽에서 플랫폼 차이는 `web/src/platform.ts`(브라우저)와 `web/src/platform-tauri.ts`(윈도우 앱)로 나뉜다.

## 보안

- 모든 API·WebSocket 은 인증 필수 (정적 파일, `/healthz`, `/about`·`/privacy`·`/terms` 만 공개)
- 모든 데이터 조회·수정은 토큰의 사용자 것으로만 한다. 기기 목록·폐기, 이력, 내보내기, WebSocket 이벤트 모두 (D-015)
- Google 로그인 + `ALLOWED_EMAILS` 허용 목록(`*`면 누구나 가입, D-017). 비어 있으면 서버가 시작되지 않는다. 목록에서 빠진 이메일은 이미 받은 토큰도 401. OAuth 는 state + 브라우저 바인딩 쿠키 + PKCE
- 누구나 가입일 때: `ADMIN_EMAILS`·`CONTACT_EMAIL` 필수, 가입 인원 `MAX_USERS`, 관리자가 아닌 사용자는 저장 용량 `USER_QUOTA_MB`(D-018)와 op 속도 `OPS_PER_MINUTE` 제한
- 계정 삭제(`DELETE /api/account`)는 본인 이메일 확인 후 그 사용자의 모든 행을 지운다 (D-020)
- 기기 토큰: 256비트 랜덤, DB 에는 SHA-256 만 저장, 90일 미사용 시 만료, 설정에서 폐기
- 웹 세션 쿠키 `HttpOnly; Secure; SameSite=Strict`. 쿠키 인증 + 상태 변경 요청은 Origin 도 검사
- 로그인 실패 IP 별 5회 → 15분 잠금. IP 는 소켓이 127.0.0.1 일 때만 `X-Forwarded-For` 의 맨 오른쪽 값(Funnel 이 붙인 값)을 씀
- 서버는 `network_mode: host`로 `127.0.0.1:3000`에만 연다. `HOST=0.0.0.0`이나 금지 포트(8080, 3306, 5432, 22, 111, 631)를 넣으면 시작을 거부한다 (D-004)
- CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, HSTS. CORS 는 Funnel 도메인과 Tauri(`http://tauri.localhost`)만
- 요청 크기: 메모 한 칸 64KB, push 4MB, 가져오기 10MB, 그 외 256KB (03-protocol 0.1)
- 설정 검증: `PUBLIC_URL` 형식, `HOST`, `PORT`, DB·Google 필수값, `ALLOWED_EMAILS` 중 하나라도 틀리면 오류를 모아 보여 주고 시작하지 않는다(`server/src/config.ts`)
- 로그에는 Authorization·쿠키·쿼리스트링(OAuth code, WS 티켓)을 남기지 않음. 로그인 실패는 IP·사유와 함께 경고 로그

## 공휴일 데이터

`data/holidays-kr.json`에 2025~2030년 데이터가 있다(설날·추석·부처님오신날 등 음력 공휴일, 대체공휴일, 2026년부터 노동절·제헌절 포함).

- 2027년은 우주항공청 월력요항 발표와 대조했다.
- 2028년 이후는 법 규정으로 계산한 값이라, 매년 발표되는 월력요항과 한 번 비교해야 한다 (O-02).
- 선거일·임시공휴일은 앱 설정에서 추가한다(`custom_holidays`, 모든 사용자 공통, `ADMIN_EMAILS`만 편집, 비우면 허용 목록 전체, D-019).
- 2030년 이후 데이터는 같은 형식으로 JSON에 추가한다.

## 측정값

### 윈도우 앱

2026-11-14, Windows 11 (빌드 26300), 12코어 PC, 릴리스 빌드에서 측정.

| 항목 | 목표 | 측정값 |
|---|---|---|
| 설치 파일 (NSIS) | 15MB 이하 | **1.19MB** (`BatangCalendar_0.1.0_x64-setup.exe`). 실행 파일 단독은 3.4MB |
| 유휴 CPU | 거의 0% | **0.00%** (60초 동안 앱+WebView2 프로세스 전체 CPU 시간 16ms) |
| 메모리 (WebView2 포함) | 100MB 이하 | **67MB** (작업 관리자 "메모리" = 개인 작업 집합 합계, 프로세스 7개). 커밋 크기(Private Bytes) 합계는 104MB |

- 메모리 내역: WebView2 브라우저 27MB, 렌더러 16MB, GPU 7.5MB, 네트워크 6MB, 앱 본체 6MB, 저장소 2.6MB, crashpad 1.8MB.
- 처음에는 107MB였다. GPU 가속을 끄면서(`--disable-gpu`) GPU 프로세스가 51MB에서 7.5MB로 줄었다 (D-013).
- 바탕화면 부착: 앱 창의 부모가 `Progman`(아이콘 레이어 호스트)이었고, Win+D를 누른 뒤에도 화면 중앙의 최상위 창이 달력 창이었다.

### 서버

x86 Docker Desktop 기준. 파이에서는 아직 재지 않았다(비슷할 것으로 예상).

| 항목 | 목표 | 측정값 |
|---|---|---|
| Docker 이미지 | 150MB 이하 | **134MB** (압축 33MB). alpine + nodejs + mariadb-dump, 서버는 단일 파일 번들 |
| 서버 메모리 | 150MB 이하 | **31MB** (유휴, `docker stats`) |
| 웹 번들 | 100KB 이하 | JS 29KB + CSS 11KB (gzip 약 14KB, 2026-11-23). 데스크톱 전용 코드 7KB 는 별도 청크 |
| 실시간 반영 | 1초 이내 | 브라우저 두 개 사이 18~170ms, 테스트 클라이언트 사이 수십 ms |
