# 📚 API 레퍼런스

**기준:** Spring Boot 3.3  
**인증:** JWT Bearer Token  
**기본 URL:** `http://localhost:8080/api`

---

## 🔐 인증

### OAuth 콜백
```http
GET /auth/callback?code=CODE&state=STATE
```

**응답:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR...",
  "expiresIn": 3600,
  "userId": "user-123"
}
```

### 토큰 갱신
```http
POST /auth/refresh
Authorization: Bearer REFRESH_TOKEN
```

**응답:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR...",
  "expiresIn": 3600
}
```

---

## 📝 메모 (Notes)

### 메모 목록 조회
```http
GET /notes
Authorization: Bearer ACCESS_TOKEN
```

**쿼리 파라미터:**
- `limit` (기본: 50): 최대 개수
- `offset` (기본: 0): 시작 위치
- `search`: 검색어
- `startDate`: 시작 날짜 (YYYY-MM-DD)
- `endDate`: 종료 날짜 (YYYY-MM-DD)

**응답:**
```json
{
  "data": [
    {
      "id": "note-123",
      "title": "메모 제목",
      "content": "메모 내용",
      "createdAt": "2026-08-27T12:00:00Z",
      "updatedAt": "2026-08-27T12:30:00Z",
      "userId": "user-123"
    }
  ],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

**에러:**
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token",
  "statusCode": 401
}
```

---

### 메모 생성
```http
POST /notes
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{
  "title": "새 메모",
  "content": "메모 내용"
}
```

**응답:** (201 Created)
```json
{
  "id": "note-456",
  "title": "새 메모",
  "content": "메모 내용",
  "createdAt": "2026-08-27T12:00:00Z",
  "updatedAt": "2026-08-27T12:00:00Z",
  "userId": "user-123"
}
```

---

### 메모 조회
```http
GET /notes/{noteId}
Authorization: Bearer ACCESS_TOKEN
```

**응답:**
```json
{
  "id": "note-123",
  "title": "메모 제목",
  "content": "메모 내용",
  "createdAt": "2026-08-27T12:00:00Z",
  "updatedAt": "2026-08-27T12:30:00Z",
  "userId": "user-123"
}
```

---

### 메모 수정
```http
PUT /notes/{noteId}
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{
  "title": "수정된 제목",
  "content": "수정된 내용"
}
```

**응답:**
```json
{
  "id": "note-123",
  "title": "수정된 제목",
  "content": "수정된 내용",
  "createdAt": "2026-08-27T12:00:00Z",
  "updatedAt": "2026-08-27T12:45:00Z",
  "userId": "user-123"
}
```

---

### 메모 삭제
```http
DELETE /notes/{noteId}
Authorization: Bearer ACCESS_TOKEN
```

**응답:** (204 No Content)

---

## 🔄 동기화 (Sync)

### 메모 일괄 푸시
```http
POST /sync/{userId}/push-notes
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json

{
  "notes": [
    {
      "id": "note-1",
      "title": "메모 1",
      "content": "내용 1",
      "updatedAt": "2026-08-27T12:00:00Z"
    }
  ]
}
```

**응답:**
```json
{
  "synced": 1,
  "failed": 0,
  "timestamp": "2026-08-27T12:00:00Z"
}
```

---

### 메모 일괄 풀
```http
GET /sync/{userId}/pull-notes
Authorization: Bearer ACCESS_TOKEN
```

**쿼리 파라미터:**
- `lastSync`: 마지막 동기화 시간 (ISO 8601)

**응답:**
```json
{
  "notes": [
    {
      "id": "note-1",
      "title": "메모 1",
      "content": "내용 1",
      "updatedAt": "2026-08-27T12:00:00Z"
    }
  ],
  "timestamp": "2026-08-27T12:00:00Z"
}
```

---

## 🏥 헬스 체크

### 상태 확인
```http
GET /health
```

**응답:**
```json
{
  "status": "UP",
  "components": {
    "db": {
      "status": "UP",
      "details": {
        "database": "PostgreSQL",
        "version": "14.5"
      }
    },
    "diskSpace": {
      "status": "UP",
      "details": {
        "total": 536870912000,
        "free": 436207648768
      }
    }
  }
}
```

---

## 🌐 WebSocket (실시간 동기화)

### 연결
```javascript
const stompClient = new StompJs.Client({
  brokerURL: 'ws://localhost:8080/ws',
  connectHeaders: {
    Authorization: 'Bearer ACCESS_TOKEN'
  },
  onConnect: () => {
    console.log('Connected');
  }
});
stompClient.activate();
```

### 구독 (Electron)
```javascript
// 유저의 메모 변경 구독
stompClient.subscribe('/user/USER_ID/topic/sync', (message) => {
  const event = JSON.parse(message.body);
  console.log('Note changed:', event);
});
```

### 메시지 형식
```json
{
  "action": "note_created",
  "payload": {
    "id": "note-123",
    "title": "메모",
    "content": "내용",
    "createdAt": "2026-08-27T12:00:00Z"
  },
  "timestamp": "2026-08-27T12:00:00Z",
  "userId": "user-123"
}
```

### 액션 종류
- `note_created`: 메모 생성
- `note_updated`: 메모 수정
- `note_deleted`: 메모 삭제

---

## 🔑 HTTP 상태 코드

| 코드 | 의미 | 설명 |
|------|------|------|
| 200 | OK | 성공 |
| 201 | Created | 생성 성공 |
| 204 | No Content | 삭제 성공 |
| 400 | Bad Request | 요청 형식 오류 |
| 401 | Unauthorized | 인증 필요 |
| 403 | Forbidden | 권한 없음 |
| 404 | Not Found | 찾을 수 없음 |
| 409 | Conflict | 충돌 (예: 중복 메모) |
| 500 | Server Error | 서버 오류 |

---

## 📄 에러 응답 형식

```json
{
  "error": "BadRequest",
  "message": "Invalid title: title cannot be empty",
  "statusCode": 400,
  "timestamp": "2026-08-27T12:00:00Z",
  "path": "/api/notes"
}
```

---

## 🧪 cURL 예제

### 로그인 후 토큰 얻기
```bash
# 브라우저에서 OAuth 로그인하여 토큰 획득
# 또는 테스트용 토큰 생성

TOKEN="eyJhbGciOiJIUzI1NiIsInR..."
```

### 메모 생성
```bash
curl -X POST http://localhost:8080/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"테스트","content":"내용"}'
```

### 메모 목록
```bash
curl -X GET "http://localhost:8080/api/notes?limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN"
```

### 메모 수정
```bash
curl -X PUT http://localhost:8080/api/notes/note-123 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"수정됨","content":"수정 내용"}'
```

### 메모 삭제
```bash
curl -X DELETE http://localhost:8080/api/notes/note-123 \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🔐 인증 헤더

모든 요청에 다음 헤더 포함:
```
Authorization: Bearer <ACCESS_TOKEN>
```

토큰이 만료되면:
1. `/auth/refresh`로 새 토큰 요청
2. 이전 요청 재시도

---

## 📊 응답 페이징

**요청:**
```http
GET /notes?limit=20&offset=40
```

**응답:**
```json
{
  "data": [...],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 40,
    "hasMore": true
  }
}
```

---

## 🔍 검색

```http
GET /notes?search=calendar
GET /notes?startDate=2026-08-01&endDate=2026-08-31
```

---

**자세한 문서는 Swagger UI에서 확인: `http://localhost:8080/swagger-ui.html`**
