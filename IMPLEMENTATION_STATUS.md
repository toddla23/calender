# Phase 1 구현 완료 현황

**작성일:** 2026-08-27  
**상태:** ✅ 완료 (코드 구현)

---

## 완료된 작업

### 1. 모노레포 구조 생성 ✅

```
calendar-app/
├── backend/              # Spring Boot 3.3 + Java 21
├── electron/             # (향후)
├── react-native/         # (향후)
├── shared/               # (향후)
├── docs/                 # 문서
├── docker-compose.yml    # 개발 환경
└── .gitignore
```

### 2. Spring Boot 백엔드 구현 ✅

#### 2-1. 프로젝트 설정
- ✅ `build.gradle` (Java 21, Spring Boot 3.3, 필수 의존성)
- ✅ 디렉토리 구조 생성
- ✅ 환경 설정 (`application.yml`, `application-local.yml`)
- ✅ Flyway 마이그레이션 (`V1__init_schema.sql`)

#### 2-2. 엔티티 & 저장소
- ✅ `User` 엔티티 (Google OAuth 매핑)
- ✅ `Note` 엔티티 (deleted_version 포함)
- ✅ `UserRepository` (JPA)
- ✅ `NoteRepository` (JPA + Native Query upsert)

#### 2-3. DTO & API
- ✅ `AuthRequest`, `AuthResponse`
- ✅ `NoteDto` (양방향 변환)
- ✅ `SyncResponse` (청크/커서 응답)
- ✅ `AuthController` (Google OAuth, JWT)
- ✅ `SyncController` (Pull/Push)

#### 2-4. 서비스 레이어
- ✅ `AuthService`
  - Google ID Token 검증
  - JWT 토큰 생성/갱신
  - 최초 로그인 시 User 자동 생성

- ✅ `SyncService`
  - Pull (청크/커서 기반, 페이징)
  - Push (배치, 개별 성공/실패 응답)
  - LWW 충돌 해결
  - deleted_version 처리

#### 2-5. 유틸리티
- ✅ `JwtTokenProvider` (JWT 생성/검증)
- ✅ `GoogleOAuthValidator` (Google ID Token 검증)

#### 2-6. 데이터베이스
- ✅ PostgreSQL 스키마 (Flyway)
  - `users` 테이블
  - `notes` 테이블 (with deleted_version)
  - `holidays` 테이블
  - `refresh_tokens` 테이블
  - 인덱스 설정

### 3. 개발 환경 ✅

- ✅ `docker-compose.yml` (PostgreSQL 15 + 자동 초기화)
- ✅ `.gitignore` (Java, Node, 환경파일 제외)

### 4. 문서화 ✅

- ✅ `README.md` (프로젝트 개요)
- ✅ `docs/SETUP.md` (개발 환경 설정 가이드 - 50+ 항목)
- ✅ `docs/API.md` (API 엔드포인트 명세)
- ✅ `docs/SYNC_PROTOCOL.md` (동기화 프로토콜 상세)
- ✅ `docs/ARCHITECTURE.md` (아키텍처 개요)

---

## 구현된 핵심 기능

### ✅ 인증 (Google OAuth2 + JWT)

```
엔드포인트:
  POST /api/auth/google      Google ID Token → JWT 토큰
  POST /api/auth/refresh     Refresh Token → 새 Access Token

기술:
  - google-auth-library 이용 ID Token 검증
  - JJWT로 자체 JWT 생성 (HS256)
  - 최초 로그인 시 User 자동 생성
  - Token 만료 시간: Access 15분, Refresh 7일
```

### ✅ 동기화 (Pull/Push)

```
엔드포인트:
  GET /api/sync/pull?since={ts}&cursor={id}&limit=50
    - 청크/커서 기반 페이징
    - 부분 실패 시 lastPullCursor부터 복구
    - 응답: items, next_cursor, has_more, server_time

  POST /api/sync/push
    - 배치 업로드
    - 개별 항목 성공/실패 응답
    - Exponential backoff 재시도

기술:
  - 원자적 upsert (ON CONFLICT)
  - Last-Write-Wins (LWW, 서버 시각 기준)
  - Tombstone 버전닝 (deleted_version)
  - 클라이언트 시계 오차 배제
```

### ✅ 데이터베이스

```
설계:
  - UUID PK (클라이언트가 생성 → 오프라인 대응)
  - 순수 DATE 타입 (타임존 버그 방지)
  - deleted + deleted_version (충돌 해결)
  - updated_at 서버 발급 (클라이언트 시계 배제)
  
스키마:
  - users (email, google_sub 유니크)
  - notes (user_id 외래키, 소프트 삭제)
  - holidays (공휴일 캐싱)
  - refresh_tokens (로그아웃 처리용)
```

---

## 테스트 준비 사항

### 즉시 테스트 가능

1. **로컬 환경 설정**
   ```bash
   docker-compose up -d
   cd backend
   ./gradlew clean build
   ./gradlew bootRun --args='--spring.profiles.active=local'
   ```

2. **API 테스트** (Postman/cURL)
   - [docs/API.md](docs/API.md) 참고
   - 실제 Google ID Token 필요

3. **데이터베이스 검증**
   ```bash
   psql -h localhost -U postgres -d calendar_db -c "\dt"
   ```

### 테스트 시나리오 (Phase 1 완료 후)

- [ ] Google 인증 성공 → JWT 토큰 발급
- [ ] JWT 토큰 갱신
- [ ] Pull (cursor 있을 때, 없을 때)
- [ ] Push (성공, 부분 실패)
- [ ] 동시 Push (레이스 컨디션 방지)
- [ ] 삭제-수정 충돌 (deleted_version)
- [ ] 서버 시계 역행 감지

---

## 아직 구현하지 않은 것

### Phase 1 범위 제외

- ❌ WebSocket 실시간 반영 (Phase 2)
- ❌ Electron 클라이언트 (Phase 2)
- ❌ React Native 클라이언트 (Phase 2)
- ❌ 공휴일 API 통합 (Phase 2)
- ❌ 홈서버 배포 설정 (Phase 3)
- ❌ 단위 테스트 (구현 병렬)
- ❌ 통합 테스트 (구현 병렬)

### 향후 개선 사항

- [ ] 상세한 에러 처리 (커스텀 예외)
- [ ] Swagger/OpenAPI 자동 생성
- [ ] 비밀번호 해싱 (Refresh Token)
- [ ] 감사 로깅 (Audit Trail)
- [ ] 캐싱 (Redis, 향후)
- [ ] 로그 집계 (ELK Stack, 향후)

---

## 파일 현황

### 백엔드 Java 파일 (14개)

```
com/calendar/
├── CalendarApplication.java (1)
├── controller/
│   ├── AuthController.java
│   └── SyncController.java
├── service/
│   ├── AuthService.java
│   └── SyncService.java
├── entity/
│   ├── User.java
│   └── Note.java
├── repository/
│   ├── UserRepository.java
│   └── NoteRepository.java
├── dto/
│   ├── AuthRequest.java
│   ├── AuthResponse.java
│   ├── NoteDto.java
│   └── SyncResponse.java
└── util/
    ├── JwtTokenProvider.java
    └── GoogleOAuthValidator.java
```

### 설정 파일

- `build.gradle` (의존성 + 빌드 설정)
- `application.yml` (공통 설정)
- `application-local.yml` (로컬 개발)
- `docker-compose.yml` (PostgreSQL)

### 데이터베이스

- `db/migration/V1__init_schema.sql` (Flyway 스키마)

### 문서

- `README.md`
- `docs/SETUP.md`
- `docs/API.md`
- `docs/SYNC_PROTOCOL.md`
- `docs/ARCHITECTURE.md`
- `IMPLEMENTATION_STATUS.md` (이 파일)

---

## 다음 단계

### 즉시 (Week 1)

1. **로컬 환경 검증**
   - Docker PostgreSQL 실행 확인
   - Spring Boot 빌드 성공 확인
   - DB 마이그레이션 적용 확인

2. **Google OAuth 설정**
   - Google Cloud Console에서 클라이언트 ID 생성
   - `GOOGLE_CLIENT_ID` 환경변수 설정

3. **기본 API 테스트**
   - Google ID Token 획득 (OAuth Playground)
   - `/api/auth/google` 엔드포인트 테스트
   - `/api/sync/pull`, `/api/sync/push` 테스트

### Phase 2 (Week 5+)

1. WebSocket STOMP 구현
2. Electron 클라이언트 (SQLite, 오프라인 CRUD)
3. React Native 클라이언트
4. sync-core 공유 라이브러리

### Phase 3 (Week 10+)

1. 홈서버 배포
2. 공휴일 API 통합
3. 운영 모니터링

---

## 팁 및 주의사항

### 개발 시 주의

1. **로컬 DB 초기화**
   ```bash
   docker-compose down -v  # 볼륨 제거
   docker-compose up -d    # 재시작
   ```

2. **JWT 토큰 디버깅**
   - [jwt.io](https://jwt.io)에 붙여서 확인

3. **Google OAuth 에러**
   - 클라이언트 ID 확인
   - 리다이렉트 URI 확인 (콘솔에서 설정한 것과 일치)

4. **SQL 쿼리 최적화**
   - 인덱스 설정 확인 (idx_notes_user_id_date 등)
   - EXPLAIN ANALYZE로 쿼리 계획 확인

### 보안 체크리스트

- [ ] `application-prod.yml`에 실제 시크릿 저장 금지 (환경변수 사용)
- [ ] Google 클라이언트 시크릿 노출 금지 (.gitignore 확인)
- [ ] JWT 시크릿 최소 32바이트 이상
- [ ] HTTPS 통신 (프로덕션)
- [ ] CORS 설정 검토

---

## 리소스

- [기획 문서](calendar-app-plan.md)
- [개발 환경 설정](docs/SETUP.md)
- [API 명세](docs/API.md)
- [동기화 프로토콜](docs/SYNC_PROTOCOL.md)
- [아키텍처](docs/ARCHITECTURE.md)

---

## 피드백 및 개선

구현 중 발견된 개선점:
- (향후 기입)

알려진 버그:
- (없음)

---

**마지막 업데이트:** 2026-08-27  
**작성자:** Claude Code
