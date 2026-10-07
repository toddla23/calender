# 캘린더 위젯 (Electron, Windows)

개인용 캘린더 앱의 Windows 데스크톱 위젯 클라이언트입니다. 오프라인에서도 조회/수정이 되고, 온라인이 되면
`shared/sync-core`(공용 동기화 코어)가 서버와 자동으로 동기화합니다. 설계 근거는 루트의 `calendar-app-plan.md` 5, 8, 9, 10장입니다.

## 구조

```
electron/
  src/main/          main 프로세스 (창, SQLite, 동기화 엔진, 인증, STOMP, 네트워크 감시, 트레이)
    index.ts           앱 진입점: 단일 인스턴스, 트레이, IPC 등록
    app-core.ts        로그인/로그아웃, 동기화 상태 스냅샷, 공휴일, 설정 처리
    stack.ts           SqlStore + SyncEngine + NoteService + HttpApiClient 조립 (통합 스크립트도 재사용)
    sql-driver.ts      better-sqlite3 / node:sqlite → sync-core SqlDriver 어댑터
    auth.ts            토큰 보관/갱신(single-flight)/로그인
    session-storage.ts 토큰을 safeStorage(DPAPI)로 암호화해 userData에 저장
    google-oauth.ts    시스템 브라우저 + 루프백 + PKCE
    realtime.ts        @stomp/stompjs + ws (createRealtimeClient 사용)
    network.ts         navigator.onLine을 믿지 않는 ping 기반 네트워크 감시
    holidays.ts        공휴일 로컬 캐시 (holidays_cache 테이블)
    win-zorder.ts      koffi + user32 SetWindowPos(HWND_BOTTOM)
    window.ts          프레임 없는 위젯 창, blur 시 맨 아래로
  src/preload/       contextBridge로 노출하는 최소 IPC
  src/renderer/      React UI (항상 로컬 DB 조회 결과로 렌더링)
  src/shared/        날짜 유틸(순수 문자열), 서버 URL 변환, 공용 타입
  scripts/           통합 스크립트, 아이콘 생성
```

`@calendar/sync-core`는 별도 빌드 없이 `../shared/sync-core/src/index.ts`를 직접 참조합니다
(`tsconfig.json`의 `paths`와 `electron.vite.config.ts` / `vitest.config.ts`의 alias 모두 설정).

## 설치와 실행

요구사항: Windows 10/11, Node 22 이상(개발은 Node 24), npm.

```powershell
cd electron
npm install          # postinstall에서 better-sqlite3를 Electron ABI에 맞게 받는다 (electron-builder install-app-deps)
npm run dev          # 개발 실행 (HMR)
npm run build        # 프로덕션 번들 (out/)
npm run start        # 빌드 결과 미리보기 실행
```

> npm 11의 `allowScripts` 경고가 보여도 이 환경에서는 네이티브 모듈이 정상 설치되었습니다. better-sqlite3가 로드되지 않으면
> `npm run rebuild` (= `electron-rebuild -f -w better-sqlite3`)를 실행하세요.

### 개발용 로그인 (Google 설정 없이)

백엔드를 `local` 프로파일로 띄운 상태에서:

```powershell
$env:CALENDAR_DEV_LOGIN = "1"
npm run dev
```

로그인 화면에 이메일 입력 창이 나타나고 `POST /api/auth/dev`로 로그인합니다. 환경변수가 없으면 이 UI는 노출되지 않고 main도 거부합니다.

## 환경변수 / 설정 파일

| 이름 | 설명 |
|---|---|
| `CALENDAR_SERVER_URL` | 서버 주소 (기본 `http://localhost:8080`). WebSocket은 http→ws, https→wss + `/ws` 로 자동 변환 |
| `CALENDAR_DEV_LOGIN=1` | 개발 로그인 UI 노출 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth 데스크톱 클라이언트 (소스에 하드코딩하지 않음) |
| `CALENDAR_USER_DATA` | 사용자 데이터 폴더 변경 (테스트/다중 프로필용) |
| `CALENDAR_SELFTEST=1` | 창 z-order 자가 점검 후 종료 (아래 "검증" 참고) |

서버 주소 우선순위: 설정 화면에서 지정한 값 > `CALENDAR_SERVER_URL` > 기본값. 설정 화면에서 바꾸면 다른 서버의 데이터이므로
로컬 데이터가 초기화되고 로그아웃된 뒤 앱이 재시작됩니다.

Google 설정은 환경변수 대신 사용자 데이터 폴더(`%APPDATA%\CalendarWidget\google-oauth.json`)에 둘 수도 있습니다.

```json
{ "clientId": "xxxx.apps.googleusercontent.com", "clientSecret": "GOCSPX-..." }
```

설정이 없으면 로그인 화면에 안내 문구가 표시됩니다.

## Google OAuth 클라이언트 등록

1. [Google Cloud Console](https://console.cloud.google.com/) → 프로젝트 선택/생성 → "API 및 서비스" → "OAuth 동의 화면" 구성
   (개인용이면 테스트 모드 + 본인 계정을 테스트 사용자로 추가).
2. "사용자 인증 정보" → "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID" → 애플리케이션 유형 **데스크톱 앱**.
3. 생성된 클라이언트 ID/시크릿을 위 환경변수 또는 `google-oauth.json`에 넣습니다.
   데스크톱 앱 유형은 **리디렉션 URI를 따로 등록하지 않아도** 루프백(`http://127.0.0.1:{임의포트}/callback`)이 허용됩니다.
   (앱이 임의 포트의 로컬 서버를 열어 코드를 받고 PKCE `code_verifier`로 토큰을 교환합니다. `웹 애플리케이션` 유형을 쓴다면
   `http://127.0.0.1` 루프백은 포트까지 정확히 등록해야 하므로 데스크톱 앱 유형을 사용하세요.)
4. 백엔드(`GOOGLE_CLIENT_ID` 등 서버 설정)가 검증하는 `aud`(클라이언트 ID)와 데스크톱 클라이언트 ID가 같아야 합니다.
   서버가 다른 클라이언트 ID(예: 모바일용)만 허용한다면 서버의 허용 목록에 이 데스크톱 클라이언트 ID도 추가해야 합니다.

## Windows 설치 파일 빌드

```powershell
npm run dist         # = npm run build && electron-builder --win nsis → dist/ 에 설치 프로그램 생성
```

`package.json`의 `build` 설정(아래 참고)에 따라 NSIS 설치 파일이 만들어지며 `better-sqlite3`, `koffi`는 asar 밖으로 풀립니다.
설치 후 설정 화면의 "Windows 로그인 시 자동 시작"은 패키지된 앱에서만 로그인 항목을 등록합니다(개발 모드에서는 무시).

## 동작 요약

- **항상 맨 아래**: `alwaysOnTop`을 쓰지 않습니다. 창이 `blur`될 때마다 `user32.SetWindowPos(hwnd, HWND_BOTTOM, 0,0,0,0, NOMOVE|NOSIZE|NOACTIVATE)`를
  `koffi`로 호출합니다. 클릭해서 포커스를 얻는 동안은 앞에 보이고 포커스를 잃으면 다시 내려갑니다. koffi 로딩에 실패하면 경고만 남기고 계속 실행됩니다.
  트레이 아이콘의 "보이기"는 창을 앞으로 올립니다(포커스를 잃으면 다시 내려감).
- **로컬 우선**: UI는 항상 로컬 SQLite 조회 결과를 그리고, main이 보내는 `notes-changed`/상태 이벤트에서 다시 조회합니다.
- **네트워크**: 15초마다 `/actuator/health`를 ping하고, 렌더러의 online/offline 이벤트는 재확인 트리거로만 사용합니다.
  상태가 바뀌면 `engine.notifyOnline()/notifyOffline()`을 호출합니다.
- **토큰**: Electron `safeStorage`로 암호화해 `auth.bin`에 저장합니다(암호화를 쓸 수 없으면 디스크에 쓰지 않음).
- **로그아웃**: 진행 중이던 동기화 결과를 폐기 → 토큰 삭제 → `store.clearAll()` → WebSocket 종료. 다른 계정으로 로그인하면
  (`app_meta.owner_user_id` 비교) 남아 있던 이전 계정 데이터를 초기화해 섞이지 않게 합니다.
- **deviceId**: `userData/device-id.txt`에 영속, **connectionId**: 프로세스 시작마다 새 UUID.
- **공휴일**: `GET /api/holidays?year=`를 `holidays_cache` 테이블에 캐시(7일 지나면 재조회)해 오프라인에서도 표시합니다.

사용자 데이터 위치: `%APPDATA%\CalendarWidget\` (`calendar.db`, `settings.json`, `auth.bin`, `device-id.txt`).

## 검증

```powershell
npm run typecheck          # main/renderer 타입 검사
npm test                   # 단위 테스트 (vitest)
npm run test:integration   # 실행 중인 백엔드(localhost:8080, local 프로파일)에 대한 통합 테스트
```

Electron 기동 자가 점검(창 생성, koffi 로딩, SetWindowPos 호출, z-order 조회):

```powershell
npm run build
$env:CALENDAR_SELFTEST = "1"; $env:CALENDAR_USER_DATA = "$env:TEMP\calwidget-test"; npx electron .
```

## 알려진 한계

- 실제 Google 로그인은 클라이언트 ID가 필요해 실환경 검증이 되지 않았습니다(루프백/PKCE 흐름은 가짜 Google로 단위 테스트).
- 서버 주소 변경은 앱 재시작과 로컬 데이터 초기화를 동반합니다.
- 다크/라이트는 OS 설정(`prefers-color-scheme`)을 따릅니다.
