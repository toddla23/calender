# 개인용 캘린더 앱 (Calendar App)

오프라인 지원 캘린더 애플리케이션. Windows 위젯, 모바일 앱(iOS/Android)에서 실시간 동기화가 가능합니다.

## 프로젝트 구조

```
calendar-app/
├── backend/              # Spring Boot 3.3 백엔드 (PostgreSQL)
├── electron/             # Electron Windows 위젯
├── react-native/         # React Native 모바일 앱
├── shared/               # 공유 라이브러리 (sync-core)
├── docs/                 # 프로젝트 문서
└── docker-compose.yml    # 로컬 개발 환경 (PostgreSQL)
```

## 핵심 기능 (Phase 1)

- ✅ Google OAuth2 인증 + JWT 토큰
- ✅ 오프라인 CRUD (SQLite, synced 플래그)
- ✅ 온/오프라인 자동 동기화
- ✅ 청크/커서 기반 Pull (부분 실패 복구)
- ✅ 원자적 upsert로 충돌 해결 (LWW, deleted_version)
- ✅ 강제 종료 후 상태 복구

## 빠른 시작

### 필수 요구사항
- Java 21
- Node.js 18+
- PostgreSQL 15+ (Docker로 제공)
- Google OAuth 클라이언트 (설정 가이드: [docs/SETUP.md](docs/SETUP.md))

### 로컬 개발 환경 설정

1. **PostgreSQL 시작**
   ```bash
   docker-compose up -d
   ```

2. **백엔드 실행**
   ```bash
   cd backend
   ./gradlew bootRun --args='--spring.profiles.active=local'
   ```
   서버: `http://localhost:8080`

3. **Electron 개발 서버 (향후)**
   ```bash
   cd electron
   npm install
   npm run dev
   ```

4. **React Native 개발 (향후)**
   ```bash
   cd react-native
   npm install
   npm run dev
   ```

## API 문서

- [API 엔드포인트](docs/API.md)
- [동기화 프로토콜](docs/SYNC_PROTOCOL.md)

## 개발 가이드

- [개발 환경 설정](docs/SETUP.md)
- [데이터베이스 스키마](docs/SCHEMA.md)

## 라이선스

MIT
