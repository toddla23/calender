# 개발 환경 설정 가이드

## 필수 소프트웨어 설치

### 1. Java 21 설치

**macOS/Linux (Homebrew)**
```bash
brew install openjdk@21
```

**Windows**
- [Oracle JDK 21](https://www.oracle.com/java/technologies/downloads/) 또는
- [Eclipse Temurin 21](https://adoptium.net/)

버전 확인:
```bash
java -version
javac -version
```

### 2. Node.js 18+ 설치

**macOS/Linux (Homebrew)**
```bash
brew install node@18
```

**Windows**
- [nodejs.org](https://nodejs.org/)에서 LTS 다운로드

버전 확인:
```bash
node --version
npm --version
```

### 3. PostgreSQL 15+ 설치 (Docker 권장)

**Docker Desktop 설치 후:**
```bash
docker --version
```

### 4. Git 설치 (있다면 확인)
```bash
git --version
```

---

## Google OAuth 클라이언트 설정

### 1. Google Cloud Console 접속
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성: "Calendar App"

### 2. OAuth2 Consent Screen 설정
1. **"OAuth 동의 화면"** 메뉴로 이동
2. **User Type: "외부"** 선택
3. **앱 정보 입력:**
   - 앱 이름: "Calendar App"
   - 사용자 지원 이메일: (자신의 이메일)
   - 개발자 연락처: (자신의 이메일)
4. **스코프 선택:**
   - `userinfo.email`
   - `userinfo.profile`
5. **테스트 사용자 추가:** 자신의 Google 계정 이메일
6. **저장**

### 3. OAuth2 클라이언트 ID 생성 (Electron용)

1. **"사용자 인증 정보"** → **"사용자 인증 정보 만들기"** → **"OAuth 2.0 클라이언트 ID"**
2. **애플리케이션 유형: "데스크톱 애플리케이션"**
3. **이름: "Calendar Electron"**
4. **생성** → JSON 다운로드 또는 ID/시크릿 메모

```
클라이언트 ID: xxx.apps.googleusercontent.com
클라이언트 시크릿: yyy...
```

5. **리다이렉트URI 추가:**
   - `http://localhost:3000/callback`
   - `http://localhost:8080/callback`

### 4. React Native용 OAuth2 클라이언트 ID (향후)
- 애플리케이션 유형: "Android" 또는 "iOS"
- 패키지명/Bundle ID 설정 (나중에 추가 가능)

---

## 로컬 개발 환경 세팅

### 1. 프로젝트 클론 및 준비

```bash
cd ~/projects/calender
ls -la
```

폴더 구조 확인:
```
backend/          # Spring Boot
electron/         # (향후)
react-native/     # (향후)
docs/             # 문서
docker-compose.yml
```

### 2. PostgreSQL 시작

```bash
# 백그라운드에서 실행
docker-compose up -d

# 상태 확인
docker-compose ps

# 로그 확인 (선택)
docker-compose logs -f postgres
```

**접속 정보:**
- Host: `localhost`
- Port: `5432`
- Database: `calendar_db`
- Username: `postgres`
- Password: `postgres`

**PostgreSQL 접속 (테스트):**
```bash
psql -h localhost -U postgres -d calendar_db -c "\dt"
```

### 3. 백엔드 환경변수 설정

**`backend/.env.local` 파일 생성 (Git에서 제외됨):**
```bash
cd backend

cat > .env.local << 'EOF'
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
JWT_SECRET=dev-secret-key-12345-change-in-production
JWT_ISSUER_URI=http://localhost:8080
EOF
```

### 4. Spring Boot 빌드 및 실행

```bash
cd backend

# 첫 실행: 의존성 다운로드 (시간 소요 ~5분)
./gradlew clean build

# 개발 모드 실행
./gradlew bootRun --args='--spring.profiles.active=local'
```

**성공 로그:**
```
Started CalendarApplication in X.XXX seconds
```

**서버 확인:**
```bash
# 다른 터미널에서
curl http://localhost:8080/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{"idToken": "test"}' -v
```

### 5. IDE 설정 (선택)

**IntelliJ IDEA:**
1. "File" → "Open" → `backend/` 디렉토리 선택
2. "Gradle" 프로젝트로 자동 감지됨
3. "Run" → "Edit Configurations" → "Spring Boot" 추가

**VSCode:**
1. Extension "Extension Pack for Java" 설치
2. `backend/` 폴더 열기
3. `.vscode/launch.json` 생성:
   ```json
   {
     "version": "0.2.0",
     "configurations": [
       {
         "type": "java",
         "name": "Spring Boot",
         "request": "launch",
         "mainClass": "com.calendar.CalendarApplication",
         "projectName": "backend",
         "cwd": "${workspaceFolder}",
         "console": "integratedTerminal",
         "internalConsoleOptions": "neverOpen",
         "env": {
           "SPRING_PROFILES_ACTIVE": "local"
         }
       }
     ]
   }
   ```

---

## API 테스트 (Postman / cURL)

### 1. Google 인증 테스트

**실제 Google ID Token 필요:**
1. [Electron 앱에서 또는 Google OAuth Playground](https://developers.google.com/oauthplayground)에서 ID Token 발급
2. 다음 명령 실행:
   ```bash
   curl -X POST http://localhost:8080/api/auth/google \
     -H "Content-Type: application/json" \
     -d '{
       "idToken": "your-actual-id-token-here"
     }' | jq .
   ```

**응답:**
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "user": {
    "id": "12345678-1234-1234-1234-123456789012",
    "email": "user@gmail.com"
  }
}
```

### 2. 토큰 갱신 테스트

```bash
curl -X POST http://localhost:8080/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "your-refresh-token-here"
  }' | jq .
```

### 3. Pull 동기화 테스트

```bash
curl -X GET "http://localhost:8080/api/sync/pull?since=2026-01-01T00:00:00Z&limit=10" \
  -H "Authorization: Bearer your-access-token" | jq .
```

### 4. Push 동기화 테스트

```bash
curl -X POST http://localhost:8080/api/sync/push \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-access-token" \
  -d '[
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "date": "2026-08-27",
      "content": "테스트 메모",
      "color": "#FF5733",
      "deleted": false,
      "deleted_version": 0
    }
  ]' | jq .
```

---

## 문제 해결

### PostgreSQL 연결 안 됨

```bash
# PostgreSQL 상태 확인
docker-compose ps

# 로그 확인
docker-compose logs postgres

# 다시 시작
docker-compose down
docker-compose up -d
```

### Gradle 빌드 실패

```bash
# 캐시 초기화
cd backend
./gradlew clean
./gradlew build
```

### JWT 토큰 만료 에러

- 로컬 개발 시 `application-local.yml`에서 `access-token-expiration` 크게 설정 (기본: 900000ms = 15분)

### Google OAuth 에러 "invalid_client"

- Google Cloud Console에서 클라이언트 ID와 리다이렉트 URI 확인
- 환경변수 `GOOGLE_CLIENT_ID` 재확인

---

## 다음 단계

- [백엔드 API 문서](API.md)
- [동기화 프로토콜](SYNC_PROTOCOL.md)
- [데이터베이스 스키마](SCHEMA.md)
