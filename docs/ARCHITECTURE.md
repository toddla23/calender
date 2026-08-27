# 아키텍처 개요 (Phase 1)

## 프로젝트 상태

**Phase 1 완료:** 백엔드 핵심 동기화 설계 구현 ✓

---

## 백엔드 아키텍처 (Spring Boot 3.3)

### 레이어 구조

```
Controller Layer (REST API)
  ├── AuthController          ← Google OAuth, JWT 발급/갱신
  └── SyncController          ← Pull/Push 동기화

Service Layer (비즈니스 로직)
  ├── AuthService             ← 인증 로직
  └── SyncService             ← 동기화 로직 (LWW, Tombstone)

Repository Layer (데이터 접근)
  ├── UserRepository          ← JPA
  └── NoteRepository          ← JPA + Native Query (upsert)

Entity Layer (도메인)
  ├── User                    ← Google 계정 매핑
  └── Note                    ← 메모 (deleted_version 포함)

Utility Layer
  ├── JwtTokenProvider        ← JWT 생성/검증
  └── GoogleOAuthValidator    ← Google ID Token 검증
```

### 핵심 클래스

| 클래스 | 역할 | 주요 메서드 |
|--------|------|-----------|
| `AuthService` | 인증 | `authenticateWithGoogle()`, `refreshAccessToken()` |
| `SyncService` | 동기화 | `pullNotes()`, `pushNotes()` |
| `NoteRepository` | DB 쿼리 | `findByUserIdAndUpdatedAt...()` (커서 기반) |
| `JwtTokenProvider` | JWT | `generateAccessToken()`, `isTokenValid()` |

---

## 데이터 모델

### PostgreSQL 스키마

```sql
-- users 테이블
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  google_sub VARCHAR UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
);

-- notes 테이블 (핵심)
CREATE TABLE notes (
  id UUID PRIMARY KEY,                    ← 클라이언트가 생성
  user_id UUID NOT NULL REFERENCES users,
  date DATE NOT NULL,                     ← 순수 날짜 (타임존 없음)
  content TEXT NOT NULL,
  color VARCHAR,
  deleted BOOLEAN DEFAULT FALSE,          ← 소프트 삭제
  deleted_version INTEGER DEFAULT 0,      ← Tombstone 버전닝
  updated_at TIMESTAMP WITH TIME ZONE,    ← LWW 기준 (서버 발급)
  created_at TIMESTAMP WITH TIME ZONE
);

-- holidays 테이블 (캐싱용)
CREATE TABLE holidays (
  id SERIAL PRIMARY KEY,
  year INTEGER,
  date DATE,
  name VARCHAR,
  cached_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(year, date)
);

-- refresh_tokens 테이블 (로그아웃 처리용)
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users,
  token_hash VARCHAR UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE
);
```

### 주요 설계 결정

| 설계 | 이유 |
|------|------|
| `id`를 클라이언트가 생성 (UUID) | 오프라인에서도 새 메모 생성 가능 |
| `date`는 `DATE` 타입 (순수 날짜) | 타임존 변환으로 인한 버그 방지 |
| `deleted` + `deleted_version` | 삭제-수정 충돌을 논리적으로 불가능하게 |
| `updated_at`을 서버가 발급 | 클라이언트 시계 오차 배제 |
| 원자적 upsert (`ON CONFLICT`) | 동시 요청 레이스 컨디션 방지 |

---

## API 엔드포인트 (Phase 1)

### 인증

```
POST /api/auth/google
  요청: { idToken: string }
  응답: { accessToken, refreshToken, user }

POST /api/auth/refresh
  요청: { refreshToken: string }
  응답: { accessToken, refreshToken, user }
```

### 동기화 (청크/커서 기반)

```
GET /api/sync/pull?since={ts}&cursor={id}&limit=50
  응답:
  {
    items: [NoteDto, ...],
    next_cursor: UUID or null,
    has_more: boolean,
    server_time: ISO8601
  }

POST /api/sync/push
  요청: [NoteDto, ...]
  응답: [{ id, success, error }, ...]
```

---

## 동기화 프로토콜 (Phase 1 핵심)

### 원칙

1. **로컬 우선:** 사용자 입력 → 즉시 로컬 DB 저장 → UI 갱신 (서버 응답 대기 ✗)
2. **Push → Pull 순서:** 로컬 변경 먼저 반영, 이어 최신 상태 Pull
3. **Last-Write-Wins (LWW):** `updated_at` 기준 (서버 발급)
4. **Tombstone 버전닝:** `deleted_version`으로 삭제-수정 충돌 방지
5. **부분 실패 복구:** 청크/커서 + 메타데이터로 강제 종료 복구

### 쓰기 경로

```
입력 → 로컬 DB upsert (synced=0) → UI 갱신 → [온라인] 백그라운드 Push
```

### 동기화 루틴

```
트리거: 오프라인→온라인 또는 백그라운드→포그라운드
  ↓
1) Push: synced=0 항목들 전송
  - 성공 응답 후만 synced=1 마킹
  - 실패 항목 exponential backoff 재시도

2) Pull: 청크/커서 기반 조회
  - 각 청크마다 lastPullCursor 저장
  - 로컬 updatedAt과 비교, 서버가 더 최신이면 반영
  - hasMore=false 시 lastSyncedAt 갱신

3) 복구 메커니즘
  - pull_in_progress 플래그로 강제 종료 감지
  - lastPullCursor 영속화로 이어서 Pull 가능
  - synced=0 항목은 재시작 시 자동 재Push
```

---

## 보안

### 인증 흐름

```
클라이언트                          서버
  ├─ Google 로그인 (브라우저)
  │  └→ Google ID Token 획득
  │
  ├─ POST /api/auth/google
  │  {"idToken": "..."}
  │
  └← Google 공개키로 검증
     │  - ID Token 서명 확인
     │  - 클라이언트 ID 확인
     │
     └─ User 생성/조회
     │
     └─ JWT 생성
        - Access Token (15분)
        - Refresh Token (7일)
```

### JWT 스펙

**Header:**
```json
{ "alg": "HS256", "typ": "JWT" }
```

**Payload:**
```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",  ← User ID
  "email": "user@gmail.com",
  "iat": 1693128600,
  "exp": 1693129500
}
```

**알고리즘:** HS256 (HMAC-SHA256)

### CORS 설정

**로컬 개발 (`application-local.yml`):**
```
http://localhost:* 허용
```

**프로덕션 (`application-prod.yml`):**
```
https://your-home-server-domain 만 허용
```

---

## 의존성

### 핵심 라이브러리

```gradle
Spring Boot 3.3.0
  - spring-boot-starter-web (REST)
  - spring-boot-starter-data-jpa (ORM)
  - spring-boot-starter-security (인증)
  - spring-boot-starter-websocket (Phase 2용)

PostgreSQL 15
  - postgresql (드라이버)
  - flyway-core (마이그레이션)

JWT & OAuth
  - jjwt (JWT 생성/검증)
  - google-auth-library-oauth2-http (Google 검증)

Java 21
  - 최신 LTS, 가상 스레드 지원
```

---

## 환경 설정

### 로컬 (`application-local.yml`)

```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/calendar_db
    username: postgres
    password: postgres
    
  jpa:
    show-sql: false
    hibernate.ddl-auto: validate

server.port: 8080

app:
  google.client-id: YOUR-CLIENT-ID
  jwt.secret: dev-secret-key
```

### 프로덕션 (`application-prod.yml`)

```yaml
spring:
  datasource:
    url: jdbc:postgresql://[home-server]:5432/calendar_db
    username: ${DB_USER}
    password: ${DB_PASSWORD}

server:
  port: 8080
  servlet.context-path: /

app:
  google.client-id: ${GOOGLE_CLIENT_ID}
  jwt.secret: ${JWT_SECRET}
```

---

## 테스트 전략

### Unit Tests (향후)

- `AuthService` 단위 테스트
- `SyncService` 단위 테스트 (LWW, Tombstone)
- `NoteRepository` 쿼리 테스트

### Integration Tests (향후)

- 전체 인증 흐름 (Google mock)
- Push/Pull 시나리오
- 충돌 해결 (LWW, deleted_version)
- 강제 종료 복구

### Manual Testing (체크리스트)

- [ ] Google 인증 성공
- [ ] JWT 토큰 생성/갱신
- [ ] Pull 청크/커서 작동
- [ ] Push 배치 성공/실패 처리
- [ ] 삭제-수정 충돌 해결

---

## 파일 구조

```
backend/
├── src/main/java/com/calendar/
│   ├── CalendarApplication.java
│   ├── controller/
│   │   ├── AuthController.java
│   │   └── SyncController.java
│   ├── service/
│   │   ├── AuthService.java
│   │   └── SyncService.java
│   ├── entity/
│   │   ├── User.java
│   │   └── Note.java
│   ├── repository/
│   │   ├── UserRepository.java
│   │   └── NoteRepository.java
│   ├── dto/
│   │   ├── AuthRequest.java
│   │   ├── AuthResponse.java
│   │   ├── NoteDto.java
│   │   └── SyncResponse.java
│   ├── util/
│   │   ├── JwtTokenProvider.java
│   │   └── GoogleOAuthValidator.java
│   └── exception/
│       ├── (향후 커스텀 예외)
│
├── src/main/resources/
│   ├── application.yml
│   ├── application-local.yml
│   ├── application-prod.yml
│   └── db/migration/
│       └── V1__init_schema.sql
│
├── build.gradle
└── gradlew
```

---

## 다음 단계 (Phase 2, 3)

### Phase 2: 실시간 + 모바일

- [ ] WebSocket STOMP 구현
- [ ] 기기 ID + 커넥션 ID로 에코 루프 방지
- [ ] React Native 클라이언트 (sync-core 공유)
- [ ] Electron 클라이언트 (SQLite, 오프라인 CRUD)

### Phase 3: 배포 + 운영

- [ ] 홈서버 배포 (DDNS + 리버스 프록시 + HTTPS)
- [ ] 공휴일 API 통합
- [ ] Tombstone 정리 정책 수립
- [ ] 모니터링 및 로깅

---

## 참고 문서

- [개발 환경 설정](SETUP.md)
- [API 엔드포인트](API.md)
- [동기화 프로토콜](SYNC_PROTOCOL.md)
- [기획 문서](../calendar-app-plan.md)
