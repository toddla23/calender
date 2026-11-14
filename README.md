# 바탕 달력

라즈베리파이에서 직접 운영하는 바탕화면 달력입니다. 날짜 칸에 메모를 바로 적고, 휴대폰(PWA)과 윈도우 바탕화면 앱(Tauri)이 실시간으로 동기화됩니다.

```
윈도우 앱 / 휴대폰 ──HTTPS·WebSocket──▶ Tailscale Funnel ──▶ 서버(127.0.0.1:3000) ──▶ MariaDB(127.0.0.1:3306)
```

> ⚠️ **공개 서비스이므로 강한 비밀번호를 쓸 것.**
> Funnel 로 인터넷 전체에 공개됩니다. 로그인에 쓰는 Google 계정은 2단계 인증을 켜 두고, `.env` 의 `DB_PASSWORD` 는 20자 이상의 무작위 문자열을 쓰세요. `.env` 는 `chmod 600` 으로 본인만 읽게 하세요.

---

## 1. 파이 배포

### 1-1. Google 로그인 준비 (처음 한 번)

1. [Google Cloud Console](https://console.cloud.google.com/) → **API 및 서비스 → OAuth 동의 화면**에서 앱을 만듭니다. 사용자 유형은 "외부", 테스트 사용자에 본인 Gmail 을 추가합니다.
2. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI: `https://raspberry-pi.tailb6b7a3.ts.net/auth/google/callback`
3. 발급된 클라이언트 ID / 보안 비밀을 아래 `.env` 에 적습니다.

윈도우 앱도 같은 클라이언트를 씁니다. 앱이 시스템 브라우저로 서버 로그인 페이지를 열고, 서버가 `127.0.0.1` 루프백으로 일회용 코드를 돌려줍니다. 이 코드는 PKCE 로 묶여 있어서 앱만 토큰으로 바꿀 수 있습니다. 그래서 Google 쪽에 데스크톱용 클라이언트를 따로 만들 필요가 없습니다.

### 1-2. `.env` 작성 → 실행

```bash
git clone <이 저장소> deskcal && cd deskcal
cp .env.example .env
chmod 600 .env
nano .env            # DB_PASSWORD, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_EMAILS 채우기
mkdir -p backups     # 백업 폴더 (컨테이너는 UID 1000 으로 씀)
docker compose up -d --build
docker compose ps    # STATUS 가 healthy 가 되면 준비 완료
docker compose logs -f
```

- MariaDB 는 파이에 이미 설치된 것을 씁니다(`127.0.0.1:3306`, DB·계정 `deskcal`). 표와 스키마는 서버가 시작할 때 마이그레이션으로 자동 생성됩니다.
- 서버는 `network_mode: host` 로 `127.0.0.1:3000` 에만 열립니다. `HOST=0.0.0.0` 이나 금지 포트(8080, 3306, 5432, 22, 111, 631)를 넣으면 시작을 거부합니다.
- `ALLOWED_EMAILS` 가 비어 있으면 서버가 시작되지 않습니다. 목록에 없는 Google 계정은 로그인할 수 없습니다.
- 로그는 10MB × 3개로 로테이션됩니다.
- 업데이트: `git pull && docker compose up -d --build`

DB 계정에 필요한 권한(이미 만들어 두셨다면 확인만):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES, LOCK TABLES, SHOW VIEW
  ON deskcal.* TO 'deskcal'@'127.0.0.1';
```

## 2. Funnel 주소로 접속 확인

```bash
curl -s https://raspberry-pi.tailb6b7a3.ts.net/healthz    # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' https://raspberry-pi.tailb6b7a3.ts.net/api/me   # 401 (로그인 필요)
```

브라우저로 `https://raspberry-pi.tailb6b7a3.ts.net` 을 열고 **Google 계정으로 로그인**을 누르면 달력이 나옵니다.

- 칸을 **더블클릭**하면 바로 편집합니다. 다른 곳을 누르거나 `Esc` 를 누르면 자동 저장됩니다.
- 편집기 아래 동그라미로 칸 배경색을 고르고, **이력**에서 이전 버전으로 되돌릴 수 있습니다.
- `PageUp` / `PageDown` 또는 `‹ ›` 로 달을 옮깁니다.
- ⚙ 설정에서 로그인된 기기 목록 확인·폐기, 임시공휴일 추가, JSON 내보내기/가져오기를 할 수 있습니다.

## 3. 휴대폰에서 쓰기

### 3-1. Android 앱 (APK)

[BatangCalendar.apk (최신 버전)](https://github.com/toddla23/calender/releases/latest/download/BatangCalendar.apk) 를 휴대폰에서 받아 설치하세요. 처음 한 번은 "출처를 알 수 없는 앱 설치"를 허용해야 합니다.

이 앱은 TWA(Trusted Web Activity)입니다. 휴대폰의 Chrome 으로 웹앱을 주소창 없이 앱 화면처럼 띄웁니다.
- 화면과 기능은 웹앱과 같고, 서버를 업데이트하면 앱도 바로 바뀝니다.
- 서버가 `/.well-known/assetlinks.json` 으로 앱 서명 지문을 알려 줘야 주소창이 사라집니다. 서버에 이미 들어 있습니다.
- Android 7.0 이상, Chrome 이 필요합니다.

**플레이스토어에 올릴 때**: 릴리스의 `BatangCalendar.aab` 를 Play Console 에 업로드하세요. 이때 "Play 앱 서명"을 쓰게 되는데, Play Console → 앱 무결성에 나오는 **앱 서명 키 SHA-256 지문**을 파이 `.env` 의 `ANDROID_CERT_SHA256=` 에 넣고 `docker compose up -d` 하세요. 그래야 스토어에서 받은 앱도 주소창 없이 열립니다. 패키지 이름 `io.github.toddla23.batangcalendar` 는 한 번 올리면 바꿀 수 없습니다.

**서명 키 관리 (중요)**: 업로드 키는 `C:\Users\jonghyeok\.deskcal-android\upload.jks` 에 있고, 비밀번호는 같은 폴더의 `keystore-password.txt` 에 있습니다. 이 키를 잃어버리면 이미 설치된 앱을 업데이트할 수 없습니다. 이 폴더를 USB나 비밀번호 관리자 등 **안전한 곳에 따로 백업**하세요. 저장소에는 절대 넣지 마세요.

GitHub Actions 가 태그마다 APK/AAB 를 빌드하려면 저장소 **Settings → Secrets and variables → Actions → New repository secret** 에 두 개를 등록해야 합니다.

| 이름 | 값 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `.deskcal-android\keystore-base64.txt` 의 내용 전체 |
| `ANDROID_KEYSTORE_PASSWORD` | `.deskcal-android\keystore-password.txt` 의 내용 |

로컬에서 직접 빌드하려면 (Android Studio 의 SDK 와 JDK 21 필요):

```powershell
cd android
$env:ANDROID_KEYSTORE_PATH = "$HOME\.deskcal-android\upload.jks"
$env:ANDROID_KEYSTORE_PASSWORD = Get-Content "$HOME\.deskcal-android\keystore-password.txt"
.\gradlew assembleRelease bundleRelease
# → app\build\outputs\apk\release\app-release.apk, app\build\outputs\bundle\release\app-release.aab
```

### 3-2. 홈 화면에 추가 (PWA, 앱 설치 없이)

- **Android (Chrome)**: 주소창 오른쪽 ⋮ → **홈 화면에 추가** (또는 "앱 설치")
- **iPhone (Safari)**: 공유 버튼 → **홈 화면에 추가**

홈 화면 아이콘으로 열면 앱처럼 전체 화면으로 뜹니다. 날짜를 **탭**하면 아래에서 편집 시트가 올라옵니다.
오프라인일 때는 마지막으로 받은 달력을 보여 주고, 고친 내용은 IndexedDB 큐에 저장했다가 연결되면 보냅니다. 오른쪽 위에 `오프라인 · 대기 N` 으로 표시됩니다.

## 4. 윈도우 클라이언트 빌드와 설치

**바로 받기**: [BatangCalendar-setup.exe (최신 버전)](https://github.com/toddla23/calender/releases/latest/download/BatangCalendar-setup.exe) · [모든 릴리스](https://github.com/toddla23/calender/releases)

코드 서명이 없어서 처음 실행할 때 SmartScreen 경고가 뜰 수 있습니다. **추가 정보 → 실행**을 누르세요.

### 4-1. 윈도우 PC 에서 직접 빌드

준비물(한 번만):
- [Node.js 22 이상](https://nodejs.org/)
- [Rust](https://rustup.rs/) (설치 시 기본값 `x86_64-pc-windows-msvc`)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 에서 **C++를 사용한 데스크톱 개발** 워크로드
- WebView2 런타임 (Windows 11 에는 기본 설치)

```powershell
git clone <이 저장소> deskcal; cd deskcal
npm ci
npm run build:desktop
```

결과물: `desktop\src-tauri\target\release\bundle\nsis\BatangCalendar_0.1.0_x64-setup.exe`

### 4-2. GitHub Actions 로 빌드

새 버전을 릴리스하려면 버전 태그를 푸시하세요. Actions 가 설치 파일을 빌드해 **Releases** 에 자동으로 첨부합니다.

```bash
git tag v0.1.1 && git push origin v0.1.1
```

태그 없이 빌드만 하려면 **Actions → "Windows 설치 파일 빌드" → Run workflow** 를 누르세요. 결과물은 실행 결과의 Artifacts 에 올라갑니다. 앱 안에 표시되는 버전은 `desktop/src-tauri/tauri.conf.json` 의 `version` 입니다. 태그와 맞춰 올려 주세요. 테스트 워크플로(`test.yml`)는 MariaDB 컨테이너로 서버·동기화 테스트를 돌리고 arm64 이미지 빌드까지 확인합니다.

### 4-3. 설치와 사용

1. 설치 파일을 실행합니다. 현재 사용자용으로 설치되며 관리자 권한은 필요 없습니다.
2. 처음 실행하면 **Google 계정으로 로그인** → 브라우저에서 로그인 → "로그인 완료" 창이 뜨면 닫습니다.
3. 바탕화면에 테두리 없는 달력 창이 붙습니다. 작업표시줄에는 나타나지 않습니다.
   - 위쪽 막대를 끌어 옮기고, 가장자리를 끌어 크기를 바꿉니다.
   - **트레이 아이콘**: 왼쪽 클릭으로 보이기/숨기기, 오른쪽 클릭으로 보이기/숨기기·설정·종료
   - **설정 → 윈도우 앱**: 서버 주소(기본 `https://raspberry-pi.tailb6b7a3.ts.net`), 배경 불투명도, 글자 크기, 표시 방식, 위치·크기 잠금, 윈도우 시작 시 자동 실행

표시 방식:

| 방식 | 동작 |
|---|---|
| 바탕화면에 붙이기 (기본) | 바탕화면 아이콘 레이어(`Progman`/`WorkerW` 안의 `SHELLDLL_DefView` 호스트)의 자식 창으로 붙습니다. Win+D 를 눌러도 보입니다. 편집하는 동안만 잠시 떼어 내서 키보드 입력을 받고, 끝나면 다시 붙습니다. 붙이지 못하면 자동으로 "항상 아래"로 바뀝니다. |
| 항상 다른 창 아래 | 일반 창이지만 항상 맨 아래에 있습니다. |
| 일반 창 | 보통 창처럼 동작합니다. |

캐시·큐·설정은 `%LOCALAPPDATA%\dev.selfhosted.batangcalendar\` 에 JSON 파일로 저장됩니다. 쓰기는 임시 파일 + 이름 바꾸기로 해서 도중에 꺼져도 깨지지 않습니다. 로그인 토큰은 Windows DPAPI 로 암호화해 `token.bin` 에 저장합니다.

### 4-4. 측정값

2026-11-14, Windows 11 (빌드 26300), 12코어 PC, 릴리스 빌드에서 측정한 값입니다.

| 항목 | 목표 | 측정값 |
|---|---|---|
| 설치 파일 (NSIS) | 15MB 이하 | **1.19MB** (`BatangCalendar_0.1.0_x64-setup.exe`). 실행 파일 단독은 3.4MB |
| 유휴 CPU | 거의 0% | **0.00%** (60초 동안 앱+WebView2 프로세스 전체 CPU 시간 16ms) |
| 메모리 (WebView2 포함) | 100MB 이하 | **67MB** (작업 관리자 "메모리" = 개인 작업 집합 합계, 프로세스 7개). 커밋 크기(Private Bytes) 합계는 104MB |

메모리 내역: WebView2 브라우저 27MB, 렌더러 16MB, GPU 7.5MB, 네트워크 6MB, 앱 본체 6MB, 저장소 2.6MB, crashpad 1.8MB.
처음에는 107MB였습니다. GPU 가속을 끄면서(`--disable-gpu`) GPU 프로세스가 51MB에서 7.5MB로 줄었습니다. 그림이 단순해서 소프트웨어 렌더링으로도 충분하고, 투명 창도 정상으로 표시됩니다.

바탕화면 부착도 확인했습니다. 앱 창의 부모가 `Progman`(아이콘 레이어 호스트)이었고, Win+D 를 누른 뒤에도 화면 중앙의 최상위 창이 달력 창이었습니다.

서버 측정값 (x86 Docker Desktop 기준. 파이에서도 비슷할 것으로 예상):

| 항목 | 목표 | 측정값 |
|---|---|---|
| Docker 이미지 | 150MB 이하 | **134MB** (압축 33MB). alpine + nodejs + mariadb-dump, 서버는 단일 파일 번들 |
| 서버 메모리 | 150MB 이하 | **31MB** (유휴, `docker stats`) |
| 웹 번들 | 100KB 이하 | JS 27KB + CSS 10KB (gzip 약 13KB). 데스크톱 전용 코드 6KB 는 별도 청크 |
| 실시간 반영 | 1초 이내 | 브라우저 두 개 사이 18~170ms, 테스트 클라이언트 사이 수십 ms |

## 5. 백업과 복원

매일 04:00(KST)에 `mariadb-dump --single-transaction` 결과를 `./backups/deskcal-YYYYMMDD-HHMMSS.sql.gz` 로 저장하고, 최근 30개만 남깁니다(`BACKUP_HOUR`, `BACKUP_KEEP` 으로 변경).

지금 바로 백업:

```bash
docker compose exec deskcal node server/bundle/backup-cli.mjs
ls -lh backups/
```

### 복원

```bash
# 1) 서버를 멈춘다
docker compose stop deskcal

# 2) 복원할 파일을 고른다
ls -1 backups/ | tail

# 3) 현재 DB 를 비우고 백업을 넣는다 (파이에 설치된 mariadb 클라이언트 사용)
mariadb -u deskcal -p -h 127.0.0.1 -e "DROP DATABASE deskcal; CREATE DATABASE deskcal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
#    ↑ 계정에 DB 생성 권한이 없으면 root 로 실행하세요: sudo mariadb -e "..."
gunzip -c backups/deskcal-20261114-040000.sql.gz | mariadb -u deskcal -p -h 127.0.0.1 deskcal

# 4) 서버 시작
docker compose start deskcal
```

복원하면 서버의 변경 번호가 뒤로 돌아갑니다. 각 기기는 다시 연결될 때 이를 감지하고(`reset`) 달력을 처음부터 다시 받습니다. 기기에 남아 있던 미전송 수정은 그대로 다시 보내집니다.

JSON 백업도 쓸 수 있습니다. 설정 → **JSON 내보내기** 로 받은 파일을 **JSON 가져오기** 로 넣으면 파일에 있는 날짜만 덮어씁니다. 덮어쓴 칸은 이력에 남아 되돌릴 수 있습니다.

---

## 구조와 설계

```
server/            Fastify + mysql2 (TypeScript). esbuild 로 단일 파일 번들 → Docker
  migrations/      postgrator SQL 마이그레이션 (시작 시 자동 적용)
  src/sync.ts      op 적용·충돌 병합·이력·since 조회
  src/auth.ts      Google OAuth(PKCE), 기기 토큰, 로그인 시도 제한, X-Forwarded-For
web/               바닐라 TypeScript + Vite. PWA 와 Tauri 가 같은 코드를 씀
  src/sync/engine.ts  오프라인 큐 + 캐시 + WebSocket 재연결 (DOM 없음, Node 테스트 가능)
desktop/src-tauri/ Tauri v2 (Rust): 바탕화면 부착(Win32), 트레이, 자동 실행, 파일 저장소, DPAPI
data/holidays-kr.json  2025~2030 공휴일
```

**스택 선택 이유**
- 서버: Node.js + Fastify 는 메모리가 적게 들고, ARM64 에서 네이티브 모듈 없이 돌아갑니다. esbuild 로 의존성까지 한 파일로 묶어 `node_modules` 없이 배포합니다.
- 프론트엔드: 프레임워크 없이 바닐라 TS 를 씁니다. 달을 바꿀 때만 42칸을 만들고, 이후에는 바뀐 칸만 다시 그립니다. 번들은 JS 27KB + CSS 10KB(gzip 합계 약 13KB)입니다.
- 데스크톱: Tauri v2. 시스템 WebView2 를 써서 설치 파일이 작습니다.

### DB 스키마 (utf8mb4)

| 표 | 용도 |
|---|---|
| `notes` | 날짜별 현재 내용·색·`version`·충돌 표시 |
| `changes` | 서버 변경 번호(`seq`, AUTO_INCREMENT). `since=` 조회와 실시간 이벤트 순서의 기준 |
| `sync_lock` | 모든 쓰기 트랜잭션이 이 행을 잠가 직렬화 → `seq` 순서와 커밋 순서가 같아서 `since` 조회에서 빠지는 변경이 없음 |
| `note_history` | 날짜 칸별 이력 (최근 100개) |
| `applied_ops` | 처리한 `opId` 와 응답. 재전송된 op 는 저장된 응답을 그대로 돌려줌 (90일 후 정리) |
| `custom_holidays` | 직접 추가한 임시공휴일 |
| `devices` | 기기별 토큰의 SHA-256 해시, 마지막 사용 시각(90일 미사용 시 만료), 폐기 시각 |

### 동기화 프로토콜

- `POST /api/sync/push {ops:[{opId, date, baseVersion, content?, color?, resolveConflict?}]}`
  - 이미 처리한 `opId` → `duplicate` (같은 결과, 다시 반영하지 않음)
  - `baseVersion == version` → 덮어쓰고 `version+1`, 변경 번호 발급, WebSocket 으로 방송
  - 다르면 → `서버 내용 + "--- 다른 기기에서 수정 ---" + 내 내용` 으로 합치고 충돌 표시. 합치기 전 두 버전은 모두 이력에 남습니다(`conflict_client` 와 직전 버전). 구분선을 지우고 저장하거나 "충돌 표시 해제"를 누르면 충돌 표시가 풀립니다.
  - 색은 마지막에 쓴 쪽이 이깁니다. 색만 바꾼 op 는 내용 충돌을 만들지 않습니다.
- `GET /api/sync/pull?since=N` → 그 뒤로 바뀐 날짜들의 최신 상태(페이지 단위). 클라이언트의 `since` 가 서버보다 크면 `reset`.
- `WS /api/ws?ticket=...` → `{type:'note', seq, note}` 푸시. 티켓은 인증된 요청으로 받는 30초짜리 일회용입니다. handshake 에서 검사합니다.

**클라이언트 큐**: 편집하면 `{opId, date, baseVersion, 새 내용}` 을 디스크(IndexedDB / 파일)에 먼저 저장하고 나서 보냅니다.
- 같은 날짜를 오프라인에서 여러 번 고치면 하나로 합칩니다.
- 이미 전송을 시도한 항목은 같은 opId 로만 재전송하고 내용을 바꾸지 않습니다. 그 뒤의 수정은 새 항목으로 쌓았다가, 앞 항목의 응답 `version` 을 base 로 이어서 보냅니다.
- 편집 시작 시점의 version 을 base 로 써서, 편집하는 사이 다른 기기의 수정을 조용히 덮어쓰지 않습니다.

**재연결 순서**: ① WebSocket 연결(이벤트는 버퍼) → ② 큐 전송 → ③ `since=lastSeq` 로 놓친 변경분 받기 → ④ 버퍼 이벤트 중 새것만 적용. 이벤트 번호에 빈 곳이 보이면 바로 `since` 조회합니다. 끊기면 지수 백오프(1초 → 최대 60초)로 재연결하고, 네트워크 복구·화면 다시 보임 이벤트가 오면 즉시 재연결합니다. 폴링은 하지 않습니다.

### 보안

- 모든 API·WebSocket 은 인증 필수 (정적 파일과 `/healthz` 만 공개)
- Google 로그인 + `ALLOWED_EMAILS` 허용 목록. OAuth 는 state + 브라우저 바인딩 쿠키 + PKCE
- 기기 토큰: 256비트 랜덤, DB 에는 SHA-256 만 저장, 90일 미사용 시 만료, 설정에서 폐기
- 웹 세션 쿠키 `HttpOnly; Secure; SameSite=Strict`. 쿠키 인증 + 상태 변경 요청은 Origin 도 검사
- 로그인 실패 IP 별 5회 → 15분 잠금. IP 는 소켓이 127.0.0.1 일 때만 `X-Forwarded-For` 의 맨 오른쪽 값(Funnel 이 붙인 값)을 씀
- CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, HSTS. CORS 는 Funnel 도메인과 Tauri(`http://tauri.localhost`)만
- 요청 크기: 메모 한 칸 64KB, 가져오기 10MB, 그 외 256KB
- 로그에는 Authorization·쿠키·쿼리스트링(OAuth code, WS 티켓)을 남기지 않음. 로그인 실패는 IP·사유와 함께 경고 로그

### 공휴일

`data/holidays-kr.json` 에 2025~2030년 데이터가 있습니다(설날·추석·부처님오신날 등 음력 공휴일, 대체공휴일, 2026년부터 노동절·제헌절 포함). 2027년은 우주항공청 월력요항 발표와 대조했습니다. 2028년 이후는 법 규정으로 계산한 값이라, 매년 발표되는 월력요항과 한 번 비교해 보세요. 선거일·임시공휴일은 설정 → **임시공휴일**에서 추가합니다(모든 기기에 바로 반영). 2030년 이후 데이터는 같은 형식으로 JSON 에 추가하면 됩니다.

## 개발

```bash
npm ci
# 테스트용 MariaDB (포트 3307)
docker run -d --name deskcal-testdb -p 127.0.0.1:3307:3306 \
  -e MARIADB_ROOT_PASSWORD=rootpw-test -e MARIADB_DATABASE=deskcal_test \
  -e MARIADB_USER=deskcal -e MARIADB_PASSWORD=testpw mariadb:11.8
npm test                 # 서버(인증·동기화·충돌) + 웹(동기화 엔진·시나리오) 테스트
npm run dev:server       # .env 필요
npm run dev:web          # http://localhost:5173 (API 는 3000 으로 프록시)
```
