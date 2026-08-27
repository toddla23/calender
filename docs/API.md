# API 문서

기본 URL: `http://localhost:8080`

---

## 인증 엔드포인트

### POST /api/auth/google

Google ID Token을 검증하고 자체 JWT 토큰을 발급합니다.

**요청:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6IjEifQ.eyJzdWIiOiIxMjM0NTY3ODkwIn0..."
}
```

**응답 (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@gmail.com"
  }
}
```

**에러 응답 (401 Unauthorized):**
```json
{
  "error": "Invalid Google ID token: Signature verification failed"
}
```

**설명:**
- `idToken`: Google로부터 받은 ID Token (필수)
- `access_token`: 이후 API 호출 시 `Authorization: Bearer {token}` 헤더에 포함
- `refresh_token`: 토큰 갱신용 (7일 유효)
- 최초 로그인 시 User 레코드 자동 생성

---

### POST /api/auth/refresh

만료된 Access Token을 갱신합니다.

**요청:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**응답 (200 OK):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@gmail.com"
  }
}
```

**에러 응답 (401 Unauthorized):**
```json
{
  "error": "Invalid refresh token"
}
```

**설명:**
- Refresh Token도 함께 재발급됨
- 기존 토큰 사용 불가 (새 토큰으로 갱신됨)

---

## 동기화 엔드포인트

### GET /api/sync/pull

클라이언트가 서버의 변경사항을 조회합니다 (청크/커서 기반).

**요청:**
```
GET /api/sync/pull?since=2026-01-01T00:00:00Z&cursor=550e8400-e29b-41d4-a716-446655440001&limit=50
Authorization: Bearer {accessToken}
```

**쿼리 파라미터:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|-----|------|
| `since` | ISO 8601 timestamp | 선택 | 이 시간 이후의 변경사항만 조회 (기본: epoch) |
| `cursor` | UUID | 선택 | 마지막 Pull의 `nextCursor` (이어서 조회용) |
| `limit` | int (1~100) | 선택 | 한 청크당 최대 항목 수 (기본: 50) |

**응답 (200 OK):**
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "date": "2026-08-27",
      "content": "회의 3시",
      "color": "#FF5733",
      "deleted": false,
      "deleted_version": 0,
      "updated_at": "2026-08-27T10:30:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "date": "2026-08-28",
      "content": "퇴근",
      "color": "#33FF57",
      "deleted": false,
      "deleted_version": 0,
      "updated_at": "2026-08-27T10:32:15Z"
    }
  ],
  "next_cursor": "550e8400-e29b-41d4-a716-446655440001",
  "has_more": true,
  "server_time": "2026-08-27T10:32:20Z"
}
```

**응답 필드:**
| 필드 | 타입 | 설명 |
|------|------|------|
| `items` | Array | 메모 배열 (최대 limit개) |
| `next_cursor` | UUID or null | 다음 청크 조회용 ID (null이면 끝) |
| `has_more` | boolean | 더 많은 데이터 있는지 여부 |
| `server_time` | ISO 8601 timestamp | 서버 현재 시각 (동기화 기준) |

**클라이언트 처리 로직 (5-5 참고):**
```
1. 첫 Pull: cursor 없음 → items 반영
2. has_more = true → next_cursor로 다시 Pull 요청
3. has_more = false → lastSyncedAt = serverTime으로 저장
4. 네트워크 끊김 → lastPullCursor부터 재개
```

**에러 응답 (401 Unauthorized):**
```json
{
  "error": "Invalid access token"
}
```

---

### POST /api/sync/push

클라이언트가 로컬 변경사항을 서버에 업로드합니다 (배치).

**요청:**
```
POST /api/sync/push
Authorization: Bearer {accessToken}
Content-Type: application/json
```

**요청 바디:**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "date": "2026-08-27",
    "content": "회의 3시로 변경",
    "color": "#FF5733",
    "deleted": false,
    "deleted_version": 0
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "date": "2026-08-28",
    "content": "퇴근",
    "color": "#33FF57",
    "deleted": true,
    "deleted_version": 1
  }
]
```

**요청 필드:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|-----|------|
| `id` | UUID | 예 | 메모 고유 ID (클라이언트가 생성) |
| `date` | DATE | 예 | 메모 날짜 (YYYY-MM-DD) |
| `content` | string | 예 | 메모 내용 |
| `color` | string | 선택 | 색상 코드 (예: "#FF5733") |
| `deleted` | boolean | 예 | 삭제 여부 |
| `deleted_version` | int | 예 | Tombstone 버전 (기본: 0) |

**응답 (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "success": true,
    "error": null
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "success": true,
    "error": null
  },
  {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "success": false,
    "error": "Invalid UUID format"
  }
]
```

**응답 필드:**
| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | UUID | 메모 ID |
| `success` | boolean | 성공 여부 |
| `error` | string or null | 실패 사유 (null이면 성공) |

**클라이언트 처리 로직 (5-5 참고):**
```
1. success=true인 항목만 로컬 synced=1로 표시
2. success=false인 항목은 synced=0 유지 (다음 시도에 포함)
3. exponential backoff로 재시도
```

**에러 응답 (401 Unauthorized):**
```json
{
  "error": "Invalid access token"
}
```

**에러 응답 (400 Bad Request):**
```json
{
  "error": "Invalid request body"
}
```

---

## 공휴일 엔드포인트 (Phase 2)

### GET /api/holidays

특정 연도의 공휴일 목록을 조회합니다 (캐싱됨).

**요청:**
```
GET /api/holidays?year=2026
Authorization: Bearer {accessToken}
```

**응답 (200 OK):**
```json
[
  {
    "date": "2026-01-01",
    "name": "신정"
  },
  {
    "date": "2026-02-17",
    "name": "설날"
  }
]
```

---

## 인증 헤더 형식

모든 동기화 엔드포인트는 JWT 토큰 기반 인증이 필요합니다.

```
Authorization: Bearer {accessToken}
```

**예시:**
```bash
curl -X GET http://localhost:8080/api/sync/pull \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 에러 코드 및 대응

| HTTP 상태 | 에러 메시지 | 대응 |
|----------|-----------|------|
| 200 | (성공) | 정상 처리 |
| 400 | Invalid request body | 요청 형식 검증, 재시도 |
| 401 | Invalid access token | `POST /api/auth/refresh` 로 토큰 갱신 |
| 401 | Invalid refresh token | 재로그인 필요 (`POST /api/auth/google`) |
| 500 | Internal server error | 서버 로그 확인, 개발자 문의 |

---

## Postman 테스트 (선택)

1. Postman 설치
2. `docs/postman_collection.json` import (향후 추가)
3. Environment 설정: `BASE_URL=http://localhost:8080`
4. 각 엔드포인트 테스트

---

## 참고

- [동기화 프로토콜](SYNC_PROTOCOL.md) — 동기화 로직 상세 설명
- [개발 환경 설정](SETUP.md) — 로컬 환경 구성
