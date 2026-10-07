# 개인용 캘린더 앱

오프라인에서도 쓰는 개인용 캘린더. Windows 위젯(Electron) + 모바일(React Native), 온라인 시 실시간 동기화.
설계 전체는 [calendar-app-plan.md](calendar-app-plan.md) 참고.

## 구조

```
backend/            Spring Boot 3.3 + MariaDB (Flyway, JWT, STOMP WebSocket)
shared/sync-core/   Electron/RN 공용 동기화 코어 (순수 TypeScript, 테스트 34개)
electron/           Windows 위젯 (Electron + React) — electron/README.md
react-native/       모바일 앱 (Expo dev client + op-sqlite) — react-native/README.md
deploy/             홈서버 배포 (Caddy HTTPS 리버스 프록시) — deploy/README.md
```

## 구현 현황

| 영역 | 상태 | 검증 |
|---|---|---|
| 백엔드 | 완료 | 스모크 28개 통과 (MariaDB 11.8) |
| sync-core | 완료 | 테스트 34개 (MemoryStore/SQLite 양쪽) |
| Electron | 완료 | 단위 57 + 백엔드 통합 42 통과, 설치 파일 빌드, 실제 기동/z-order 확인 |
| React Native | 완료 | 단위 53 + 번들 + 백엔드 통합 통과 |

### 미검증 (사용자 환경 필요)
- Google 실제 로그인 (OAuth 클라이언트 ID 필요) — 개발 로그인(`/api/auth/dev`)으로만 확인
- React Native 실기기/에뮬레이터 구동, op-sqlite 네이티브 동작
- 공휴일 실제 표시 (`HOLIDAY_API_KEY` 필요)
- 위젯의 실제 클릭/포커스 전환 타이밍 (계획서 12장)

## 백엔드 실행

필수: Java 21, MariaDB 10.6+ (11.x 권장)

```bash
cd backend
# DB 접속 정보는 git에 올라가지 않는 backend/config/application-local.yml 에 둔다
#   spring.datasource.url / username / password
SPRING_PROFILES_ACTIVE=local ./gradlew bootRun
```

로컬 DB가 없으면 `docker compose up -d mariadb` (기본 계정 calendar/calendar).
클라이언트 실행은 [electron/README.md](electron/README.md), [react-native/README.md](react-native/README.md), 운영 배포는 [deploy/README.md](deploy/README.md) 참고.
`local` 프로파일은 Google 없이 이메일로 로그인하는 `POST /api/auth/dev`를 켠다 (운영 금지).

동기화 핵심 시나리오 검증:

```bash
python backend/scripts/smoke_test.py http://localhost:8080
```

## 환경변수 (운영)

| 이름 | 설명 |
|---|---|
| `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` | MariaDB 접속 |
| `JWT_SECRET` | 32바이트 이상 (필수) |
| `GOOGLE_CLIENT_IDS` | 쉼표 구분 OAuth 클라이언트 ID |
| `HOLIDAY_API_KEY` | 공공데이터포털 특일 정보 서비스 키 |

## API 요약

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/auth/google` | Google ID Token → 자체 JWT |
| POST | `/api/auth/refresh` | Refresh Token으로 재발급 |
| GET | `/api/sync/pull?since&cursor&limit` | 변경분 청크 조회 |
| POST | `/api/sync/push` | 변경분 배치 업로드 (`X-Device-Id`, `X-Connection-Id` 헤더) |
| GET | `/api/holidays?year=` | 공휴일 (백엔드 캐시) |
| WS | `/ws` (STOMP), 구독 `/topic/notes/{userId}` | 실시간 반영 |
