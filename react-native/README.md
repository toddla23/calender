# 내 캘린더 - React Native 모바일 클라이언트 (iOS / Android)

개인용 캘린더 앱의 모바일 클라이언트. 오프라인에서도 쓰고(로컬 SQLite), 온라인이 되면 서버와 자동 동기화합니다.
동기화 로직은 직접 만들지 않고 공용 코어 `shared/sync-core`(`@calendar/sync-core`)를 그대로 사용합니다.

## 스택과 선택 이유

| 항목 | 선택 |
|---|---|
| 프레임워크 | **Expo SDK 57 (dev client + prebuild)**, React Native 0.86, TypeScript |
| 로컬 DB | `@op-engineering/op-sqlite` (계획서 10장) + `SqlStore` (sync-core) |
| 네비게이션 / 상태 | React Navigation (native-stack) / Zustand |
| 실시간 | `@stomp/stompjs` + sync-core `createRealtimeClient` |
| 로그인 | `@react-native-google-signin/google-signin` (ID Token 획득 -> 서버 `/api/auth/google`) |
| 토큰 저장 | `expo-secure-store` (Keychain / Keystore) |
| 네트워크 감지 | `@react-native-community/netinfo` + `AppState` |

Expo(prebuild)를 쓴 이유: op-sqlite, Google 로그인 같은 네이티브 모듈을 쓰면서도 Windows에서 `android/`, `ios/` 폴더를 직접 관리하지 않고
`app.config.ts`와 config plugin으로 구성할 수 있고, Mac이 없어도 `eas build`로 iOS 빌드가 가능하기 때문입니다.
네이티브 모듈이 있으므로 **Expo Go는 사용할 수 없고** 개발 빌드(dev client)가 필요합니다.

## 폴더 구조

```
react-native/
  App.tsx, index.ts            진입점 (polyfills -> 앱), 로그인 여부에 따라 화면 전환
  app.config.ts                Expo 설정 (환경변수 -> extra, 평문 HTTP 허용 여부, Google 플러그인)
  metro.config.js              shared/sync-core 를 watchFolders + extraNodeModules 로 연결
  eas.json                     development / preview / production 빌드 프로파일
  src/
    lib/        date.ts(순수 문자열 날짜), url.ts(서버 URL/ws 변환), colors.ts
    db/         op-sqlite-driver.ts(SqlDriver 얇은 어댑터), open.ts(네이티브 연결), holidays-cache.ts
    platform/   kv.ts, native-kv.ts(SecureStore/AsyncStorage), ids.ts(deviceId)
    runtime/    auth.ts(AuthClient/TokenManager), orchestrator.ts(NetInfo/AppState/WebSocket),
                runtime.ts(서비스 조립, 로그인/로그아웃), stomp.ts(RN용 STOMP), native.ts
    state/      app-store.ts(Zustand), runtime-context.tsx(훅: 로컬 DB 조회)
    screens/    Login, Calendar, DayDetail, NoteEdit, Search, Settings
  __tests__/    Jest 단위 테스트
  scripts/integration.ts       실행 중인 백엔드 대상 통합 검증
```

`@calendar/sync-core`는 `tsconfig.json`의 `paths`(타입)와 `metro.config.js`(번들), `jest.config.js`의 `moduleNameMapper`(테스트)로
`shared/sync-core/src/index.ts`를 직접 가리킵니다. 별도 빌드 단계는 없습니다.

## 설치

```bash
cd react-native
npm install
```

## 개발 빌드 / 실행

```bash
# 1) 네이티브 프로젝트 생성 + 설치 + 실행 (Android SDK / 에뮬레이터 필요)
npx expo prebuild --platform android
npm run android            # = expo run:android

# iOS는 macOS + Xcode 가 필요하므로 로컬 대신 EAS 클라우드 빌드를 권장
npx eas build --profile development --platform ios       # 개발용 dev client
npx eas build --profile development --platform android   # APK

# 개발 서버 (dev client 설치 후)
npm run start:dev-client
```

`android/`, `ios/` 는 prebuild 산출물이라 `.gitignore` 처리되어 있습니다. 설정은 `app.config.ts`만 수정하세요.

## 환경변수 (빌드 시점에 `app.config.ts`가 읽음)

| 변수 | 설명 | 기본값 |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | 기본 서버 주소 (앱의 설정/로그인 화면에서 런타임 변경 가능) | `http://10.0.2.2:8080` |
| `GOOGLE_WEB_CLIENT_ID` | Google **웹** 클라이언트 ID. 서버가 ID Token의 audience로 검증하는 값과 같아야 함 | (없으면 Google 로그인 비활성 + 안내 문구) |
| `GOOGLE_IOS_CLIENT_ID` | Google iOS 클라이언트 ID | |
| `GOOGLE_IOS_URL_SCHEME` | iOS 클라이언트 ID의 역순 형태 `com.googleusercontent.apps.<id>` | 플레이스홀더 |
| `ANDROID_PACKAGE`, `IOS_BUNDLE_ID` | 앱 식별자 | `com.example.mycalendar` |
| `APP_VARIANT=production` | 운영 빌드: 평문 HTTP 금지 | (개발: 허용) |

예: `GOOGLE_WEB_CLIENT_ID=xxxx.apps.googleusercontent.com npx expo prebuild`
EAS 빌드는 `eas.json`의 `env` 또는 EAS 환경변수/시크릿에 같은 이름으로 지정합니다.

### 서버 주소와 평문 HTTP

- Android 에뮬레이터에서 호스트 PC는 `10.0.2.2`, 실기기는 PC의 LAN IP(예 `http://192.168.0.10:8080`).
- 평문 HTTP는 **개발 빌드에서만** 허용됩니다 (`app.config.ts`: Android `usesCleartextTraffic`, iOS ATS 예외를 `APP_VARIANT !== production`일 때만 설정).
  운영은 HTTPS(홈서버 리버스 프록시)만 사용하세요.
- WebSocket 주소는 서버 주소에서 자동 변환됩니다 (`http` -> `ws`, `https` -> `wss`, 뒤에 `/ws`).

## Google 로그인 설정

1. Google Cloud Console > OAuth 동의 화면 구성 후 클라이언트 ID 3종을 만듭니다.
   - **웹 애플리케이션**: `GOOGLE_WEB_CLIENT_ID`. 백엔드의 Google client-id 설정에도 같은 값을 넣습니다.
   - **Android**: 패키지명(`ANDROID_PACKAGE`) + **SHA-1 지문**. 디버그 키스토어 SHA-1은
     `cd android && ./gradlew signingReport` (또는 `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`).
     EAS 빌드는 `eas credentials` 로 확인한 SHA-1을 등록합니다. Play 배포 시 Play 앱 서명 SHA-1도 추가해야 합니다.
   - **iOS**: 번들 ID(`IOS_BUNDLE_ID`). 발급된 iOS 클라이언트 ID를 `GOOGLE_IOS_CLIENT_ID`, 역순 값을 `GOOGLE_IOS_URL_SCHEME`(URL scheme)에 지정합니다.
2. 환경변수를 지정하고 `expo prebuild`(또는 `eas build`)를 다시 실행합니다. 클라이언트 ID 값은 소스에 커밋하지 않습니다.
3. 설정이 없으면 로그인 화면에 안내 문구가 나오고 Google 버튼이 비활성화됩니다.

**개발 로그인**: `__DEV__` 빌드에서만 로그인 화면에 이메일 입력 로그인이 나타납니다 (`POST /api/auth/dev`, 서버가 local 프로파일일 때만 동작).

## 동작 요약

- **로컬 우선**: 모든 화면은 로컬 SQLite 조회 결과로 그리며, `notes-changed` 이벤트마다 재조회합니다. 저장은 즉시 로컬에 되고 백그라운드로 Push 됩니다.
- **동기화 트리거**: NetInfo 오프라인 -> 온라인 시 NetInfo 값을 믿지 않고 `api.ping()`으로 서버 도달을 확인한 뒤 `engine.notifyOnline()`.
  `AppState`가 background -> active 로 돌아오면 `engine.notifyForeground()`. (`src/runtime/orchestrator.ts`)
- **실시간**: WebSocket(STOMP)은 앱이 포그라운드일 때만 유지합니다. background 진입 시 `deactivate()`, 복귀 시 `activate()`
  (연결 시 코어가 sync를 한 번 실행해 공백을 메웁니다). RN용 설정 `forceBinaryWSFrames`, `appendMissingNULLonIncoming`, TextEncoder 폴리필 적용.
  연결 시도마다 만료 임박 토큰은 먼저 갱신합니다. FCM 백그라운드 동기화는 1차 범위에서 제외.
- **식별자/보안**: deviceId = 설치당 UUID 1개(영속), connectionId = 프로세스 시작마다 새 UUID. 토큰은 SecureStore.
  `refreshAccessToken`은 `/api/auth/refresh` 호출(동시 401에도 1회만) 후 저장, 401이면 `AuthExpiredError`.
- **로그아웃**: 실시간 종료 -> 엔진 정지 -> `store.clearAll()` -> 토큰 삭제. 다른 계정으로 로그인하거나 서버 주소를 바꿀 때도 이전 데이터를 비웁니다.
  늦게 도착한 동기화 결과가 비워진 DB에 다시 쓰이지 않도록 엔진에는 닫을 수 있는 저장소 래퍼(`GuardedStore`)를 넘깁니다.
- **세션 만료**(`auth-expired`): 로그인 화면으로 이동하고, 같은 계정으로 재로그인하면 로컬 변경을 보존한 채 `engine.resetAuth()` + `engine.sync()`.
- **공휴일**: `api.getHolidays(year)` 결과를 SQLite `holidays_cache` 테이블에 연 단위로 캐시(오프라인 표시). 30일 경과 시 갱신, 빈 목록은 1일 후 재확인.
- **날짜**: `date`는 항상 `'YYYY-MM-DD'` 문자열. 계산은 UTC 기준(`Date.UTC`)으로만 하고 "오늘"만 기기 로컬 달력 날짜를 사용해 자정 근처 하루 밀림을 막습니다.

## 검증 명령

```bash
npm run typecheck           # tsc --noEmit
npm test                    # Jest 단위 테스트
npm run test:integration    # 실행 중인 백엔드(기본 http://localhost:8080, API_BASE_URL로 변경)에 dev 로그인 후 왕복 검증
npm run bundle              # expo export --platform android (Metro 번들, @calendar/sync-core 해석 확인)
npx expo-doctor
```

## 알려진 한계

- **네이티브 빌드/기기 실행은 이 환경에서 검증하지 못했습니다** (Android SDK, Xcode 없음). 아래 항목은 실기기/에뮬레이터에서 직접 확인이 필요합니다.
  - op-sqlite 네이티브 동작 (어댑터 로직만 node:sqlite로 대체해 테스트함. op-sqlite의 `execute`가 문장 1개만 실행한다는 가정으로 문장 분할 구현)
  - Google 실제 로그인, 시각적 UI/레이아웃, SecureStore, RN 환경의 STOMP(Hermes WebSocket)
  - 실제 NetInfo/AppState 이벤트 (모킹으로만 테스트)
- 날짜 선택은 +-1일/+-1달 버튼 방식 (날짜 피커 라이브러리 미사용).
- 공휴일은 서버가 데이터를 가지고 있어야 표시됩니다 (서버에 `HOLIDAY_API_KEY`가 없으면 `/api/holidays`가 빈 목록을 반환).
- 푸시(FCM) 기반 백그라운드 동기화, 위젯, 다크 모드, 접근성 세부 튜닝은 미구현.
- 앱 아이콘/스플래시는 Expo 기본 에셋입니다.
