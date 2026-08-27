# 🔑 API 키 및 환경 설정 가이드

**대상:** 개발자, 배포 담당자  
**마지막 업데이트:** 2026-08-27  
**예상 시간:** 1-2시간

---

## 📋 개요

이 가이드는 프로젝트 배포에 필요한 모든 API 키와 환경 변수 설정 방법을 설명합니다.

### 필요한 API & 서비스
| 서비스 | 용도 | 필수 여부 | 비용 |
|--------|------|---------|------|
| **Google OAuth** | 사용자 인증 | ✅ 필수 | 무료 |
| **PostgreSQL DB** | 데이터 저장소 | ✅ 필수 | 유료/무료 |
| **공공데이터포털** | 공휴일 데이터 | ✅ 필수 | 무료 |
| **DDNS (DuckDNS)** | 도메인 관리 | ⚠️ 권장 | 무료 |
| **Let's Encrypt** | SSL 인증서 | ⚠️ 권장 | 무료 |

---

## 🔐 1단계: Google OAuth 설정

### 1.1 Google Cloud Console 접근

1. **Google Cloud Console 접속**
   - URL: https://console.cloud.google.com/
   - Google 계정으로 로그인

2. **새 프로젝트 생성**
   ```
   프로젝트 이름: Calendar App
   조직: 없음 (개인 프로젝트)
   위치: 한국
   ```

3. **API 활성화**
   - 검색창에 "Google+ API" 검색
   - "Google+ API" 활성화 클릭
   - 검색창에 "OAuth" 검색
   - "Google Identity" 활성화 클릭

### 1.2 OAuth 동의 화면 구성

1. **좌측 메뉴에서 "OAuth 동의 화면" 선택**

2. **사용자 유형 선택**
   - "외부" 선택 (개인 프로젝트)

3. **앱 정보 입력**
   ```
   앱 이름:        Calendar App
   사용자 지원 이메일: your-email@gmail.com
   개발자 연락처 정보: your-email@gmail.com
   ```

4. **범위(Scopes) 설정**
   - 다음 권한 추가:
     - `userinfo.profile` (프로필 조회)
     - `userinfo.email` (이메일 조회)

5. **테스트 사용자 추가 (선택)**
   - 귀하의 Gmail 주소 추가
   - 프로덕션 배포 전까지만 필요

### 1.3 OAuth 클라이언트 ID 생성

1. **좌측 메뉴에서 "사용자 인증 정보" 선택**

2. **"사용자 인증 정보 만들기" 클릭**

3. **"OAuth 2.0 클라이언트 ID" 선택**

4. **애플리케이션 유형 선택: "데스크톱 애플리케이션"**

5. **Electron용 클라이언트 ID 생성**
   ```
   이름: Calendar Electron
   ```
   - 생성 후 JSON 다운로드
   - 저장 경로: `electron/src/config/oauth-credentials.json`

6. **React Native용 클라이언트 ID 생성**
   ```
   이름: Calendar React Native
   ```
   - 생성 후 JSON 다운로드
   - 저장 경로: `react-native/src/config/oauth-credentials.json`

7. **웹 애플리케이션용 클라이언트 ID 생성**
   ```
   이름: Calendar Web API
   ```
   - 승인된 리다이렉트 URI 추가:
     - `http://localhost:3000/callback`
     - `http://localhost:8080/callback`
     - `https://your-domain.com/callback`

### 1.4 클라이언트 ID & 시크릿 저장

**JSON 파일 포맷:**
```json
{
  "type": "desktop",
  "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
  "client_secret": "YOUR_CLIENT_SECRET",
  "redirect_uris": [
    "http://localhost:3000/callback",
    "https://your-domain.com/callback"
  ]
}
```

**저장 위치:**
```
electron/src/config/
  └── oauth-credentials.json

react-native/src/config/
  └── oauth-credentials.json
```

---

## 💾 2단계: PostgreSQL 데이터베이스 설정

### 2.1 로컬 개발 환경

#### 설치 (macOS)
```bash
brew install postgresql
brew services start postgresql
```

#### 설치 (Ubuntu/Debian)
```bash
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start
```

#### 설치 (Windows)
- 다운로드: https://www.postgresql.org/download/windows/
- 설치 마법사 따라하기
- 기본 포트: 5432

### 2.2 데이터베이스 생성

```bash
# PostgreSQL 접속
psql -U postgres

# 데이터베이스 생성
CREATE DATABASE calender;

# 사용자 생성
CREATE USER calender_dev WITH PASSWORD 'dev_password';

# 권한 부여
GRANT ALL PRIVILEGES ON DATABASE calender TO calender_dev;

# 기본 스키마 생성
\c calender

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  google_sub VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notes (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  date DATE NOT NULL,
  content TEXT,
  color VARCHAR(50),
  deleted BOOLEAN DEFAULT FALSE,
  deleted_version INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  synced BOOLEAN DEFAULT FALSE
);

CREATE TABLE sync_meta (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  last_synced_at TIMESTAMP,
  last_pull_cursor UUID,
  pull_in_progress BOOLEAN DEFAULT FALSE
);

# 인덱스 생성
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_date ON notes(date);
CREATE INDEX idx_notes_updated_at ON notes(updated_at);
```

### 2.3 연결 정보 저장

**Backend 설정 파일:** `backend/src/main/resources/application.properties`

```properties
# 개발 환경
spring.datasource.url=jdbc:postgresql://localhost:5432/calender
spring.datasource.username=calender_dev
spring.datasource.password=dev_password
spring.jpa.hibernate.ddl-auto=validate

# 프로덕션 환경
# backend/src/main/resources/application-prod.properties
spring.datasource.url=${SPRING_DATASOURCE_URL}
spring.datasource.username=${SPRING_DATASOURCE_USERNAME}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD}
```

### 2.4 프로덕션 데이터베이스 (AWS RDS 예시)

```bash
# AWS RDS PostgreSQL 생성
# 1. AWS Management Console 접속
# 2. RDS → Databases → Create Database
# 3. PostgreSQL 14.x 선택
# 4. 인스턴스 설정:
#    - 이름: calender-db
#    - 마스터 사용자명: postgres
#    - 암호: (강력한 암호)
#    - DB 인스턴스 클래스: db.t3.micro (프리티어)
#    - 스토리지: 20GB

# 생성 후 엔드포인트 확인:
# calender-db.xxxxxxxxxxxx.us-east-1.rds.amazonaws.com:5432

# 환경 변수 설정:
export SPRING_DATASOURCE_URL=jdbc:postgresql://calender-db.xxxxxxxxxxxx.us-east-1.rds.amazonaws.com:5432/calender
export SPRING_DATASOURCE_USERNAME=postgres
export SPRING_DATASOURCE_PASSWORD=your_strong_password
```

---

## 📍 3단계: 공공데이터포털 (공휴일 API)

### 3.1 API 키 발급

1. **공공데이터포털 접속**
   - URL: https://www.data.go.kr/

2. **회원가입/로그인**

3. **"특일정보" 검색**
   - 데이터셋명: 공공데이터포털 특일정보
   - 제공 기관: 한국천문연구원

4. **"활용신청" 클릭**
   - 목적 선택: 개인용
   - 신청

5. **승인 대기 (보통 24시간)**

6. **API 키 복사**
   - 마이페이지 → 개발 현황 → API 키 확인
   - 형식: `serviceKey=YOUR_API_KEY`

### 3.2 API 호출 테스트

```bash
# API 엔드포인트
curl "http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=YOUR_API_KEY&solYear=2026&numOfRows=100"

# 응답 형식 (XML):
# <holidays>
#   <item>
#     <locdate>20260101</locdate>
#     <dateName>신정</dateName>
#   </item>
# </holidays>
```

### 3.3 백엔드에 키 저장

**Backend 설정:** `application.properties`

```properties
# 개발 환경
holiday.api.key=YOUR_API_KEY
holiday.api.url=http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo

# 프로덕션 환경
holiday.api.key=${HOLIDAY_API_KEY}
holiday.api.url=${HOLIDAY_API_URL}
```

**Java 코드 예시:**

```java
@Value("${holiday.api.key}")
private String holidayApiKey;

@Value("${holiday.api.url}")
private String holidayApiUrl;

@Scheduled(cron = "0 0 0 1 1 *") // 매년 1월 1일
public void refreshHolidays() {
    String url = holidayApiUrl + "?serviceKey=" + holidayApiKey + "&solYear=2026";
    // API 호출 및 캐싱
}
```

---

## 🔗 4단계: 홈서버 도메인 설정 (DDNS)

### 4.1 DuckDNS 설정 (무료)

1. **DuckDNS 접속**
   - URL: https://www.duckdns.org/
   - GitHub/Google로 로그인

2. **도메인 생성**
   ```
   Domains 탭 → 새 도메인 추가
   예: my-calendar.duckdns.org
   ```

3. **IP 주소 설정**
   ```
   현재 공인 IP 조회: https://www.whatismyipaddress.com/
   입력 후 저장
   ```

4. **자동 갱신 설정 (유동 IP용)**

   **Linux/macOS:**
   ```bash
   # /home/user/duckdns/duck.sh 파일 생성
   #!/bin/bash
   echo url="https://www.duckdns.org/update?domains=my-calendar&token=YOUR_TOKEN&ip=" | curl -k -o ~/duckdns/duck.log -d @-
   
   # 실행 권한
   chmod 700 /home/user/duckdns/duck.sh
   
   # 크론 작업 (매 5분)
   crontab -e
   */5 * * * * /home/user/duckdns/duck.sh >/dev/null 2>&1
   ```

   **Windows (Task Scheduler):**
   ```batch
   REM C:\duckdns\update.bat
   @echo off
   cd C:\duckdns
   for /f %%a in ('powershell -command "(New-Object net.webclient).DownloadString('https://www.duckdns.org/update?domains=my-calendar&token=YOUR_TOKEN&ip=')"') do (
       echo %%a
   ) > duck.log
   ```

### 4.2 포트 포워딩 설정

**공유기 설정:**

1. 공유기 관리 페이지 접속 (`192.168.1.1`)
2. 포트 포워딩 설정
   ```
   외부 포트: 443 (HTTPS)
   내부 IP: 192.168.1.100 (백엔드 서버)
   내부 포트: 8080
   
   외부 포트: 80 (HTTP)
   내부 IP: 192.168.1.100
   내부 포트: 8080
   ```

3. 테스트
   ```bash
   # 외부에서 접속 가능 확인
   curl https://my-calendar.duckdns.org/api/health
   ```

---

## 🔒 5단계: SSL 인증서 (Let's Encrypt + Caddy)

### 5.1 Caddy 설치

```bash
# macOS
brew install caddy

# Ubuntu/Debian
sudo apt install caddy

# Windows
# 다운로드: https://github.com/caddyserver/caddy/releases
```

### 5.2 Caddy 설정

**파일:** `/etc/caddy/Caddyfile` (또는 `C:\caddy\Caddyfile` Windows)

```caddy
my-calendar.duckdns.org:443 {
    reverse_proxy 127.0.0.1:8080
    
    # WebSocket 지원
    @websocket {
        header Connection *Upgrade*
        header Upgrade websocket
    }
    reverse_proxy @websocket 127.0.0.1:8080
    
    # 로깅
    log {
        output file /var/log/caddy/access.log
    }
}

# HTTP → HTTPS 리다이렉트
my-calendar.duckdns.org:80 {
    redir https://{host}{uri} permanent
}
```

### 5.3 Caddy 시작

```bash
# 설정 테스트
caddy validate

# 시작
caddy start

# 상태 확인
caddy list-uses

# 로그 확인
tail -f /var/log/caddy/access.log
```

### 5.4 SSL 인증서 자동 갱신

```bash
# Let's Encrypt는 Caddy에서 자동 처리됨
# 3개월마다 자동 갱신

# 갱신 확인
caddy reload
```

---

## 🌍 6단계: Electron 환경 변수

### 6.1 개발 환경

**파일:** `electron/.env.development`

```bash
# API 설정
API_URL=http://localhost:8080
WS_URL=ws://localhost:8080/ws

# OAuth 설정
GOOGLE_CLIENT_ID=YOUR_ELECTRON_CLIENT_ID.apps.googleusercontent.com

# 개발 플래그
DEBUG=true
LOG_LEVEL=debug
```

### 6.2 프로덕션 환경

**파일:** `electron/.env.production`

```bash
# API 설정
API_URL=https://my-calendar.duckdns.org
WS_URL=wss://my-calendar.duckdns.org/ws

# OAuth 설정
GOOGLE_CLIENT_ID=YOUR_ELECTRON_CLIENT_ID.apps.googleusercontent.com

# 프로덕션 플래그
DEBUG=false
LOG_LEVEL=error
```

### 6.3 코드에서 환경 변수 사용

```typescript
// electron/src/main/config/env.ts
export const API_URL = process.env.API_URL || 'http://localhost:8080';
export const WS_URL = process.env.WS_URL || 'ws://localhost:8080/ws';
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
export const DEBUG = process.env.DEBUG === 'true';
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
```

### 6.4 Electron 빌드 시 환경 변수 로드

```bash
# 개발 빌드
npm run dev

# 프로덕션 빌드
NODE_ENV=production npm run build
```

---

## 📱 7단계: React Native 환경 변수

### 7.1 개발 환경

**파일:** `react-native/.env.development`

```bash
# API 설정
API_BASE_URL=http://localhost:8080
WS_URL=ws://localhost:8080/ws

# OAuth 설정
GOOGLE_CLIENT_ID=YOUR_REACT_NATIVE_CLIENT_ID.apps.googleusercontent.com

# 개발 플래그
DEBUG=true
```

### 7.2 프로덕션 환경

**파일:** `react-native/.env.production`

```bash
# API 설정
API_BASE_URL=https://my-calendar.duckdns.org
WS_URL=wss://my-calendar.duckdns.org/ws

# OAuth 설정
GOOGLE_CLIENT_ID=YOUR_REACT_NATIVE_CLIENT_ID.apps.googleusercontent.com

# 프로덕션 플래그
DEBUG=false
```

### 7.3 코드에서 환경 변수 사용

```typescript
// react-native/src/config/env.ts
import Config from 'react-native-config';

export const API_BASE_URL = Config.API_BASE_URL || 'http://localhost:8080';
export const WS_URL = Config.WS_URL || 'ws://localhost:8080/ws';
export const GOOGLE_CLIENT_ID = Config.GOOGLE_CLIENT_ID || '';
export const DEBUG = Config.DEBUG === 'true';
```

### 7.4 빌드 시 환경 변수 로드

```bash
# 개발 빌드
ENVFILE=.env.development npm run android

# 프로덕션 빌드
ENVFILE=.env.production npm run android
```

---

## 🔧 8단계: Backend 환경 변수

### 8.1 application.properties 구조

**개발:** `backend/src/main/resources/application.properties`
```properties
spring.profiles.active=dev
```

**프로덕션:** `backend/src/main/resources/application-prod.properties`
```properties
# Database
spring.datasource.url=${SPRING_DATASOURCE_URL}
spring.datasource.username=${SPRING_DATASOURCE_USERNAME}
spring.datasource.password=${SPRING_DATASOURCE_PASSWORD}

# JWT
jwt.secret=${JWT_SECRET}
jwt.expiration=${JWT_EXPIRATION:3600000}
jwt.refresh-expiration=${JWT_REFRESH_EXPIRATION:86400000}

# Google OAuth
google.client-id=${GOOGLE_CLIENT_ID}
google.client-secret=${GOOGLE_CLIENT_SECRET}

# 공휴일 API
holiday.api.key=${HOLIDAY_API_KEY}
holiday.api.url=${HOLIDAY_API_URL}

# Server
server.port=${SERVER_PORT:8080}
server.servlet.context-path=/api

# Logging
logging.level.root=${LOGGING_LEVEL_ROOT:INFO}
logging.file.name=/opt/calender/logs/app.log
```

### 8.2 환경 변수 설정 (배포 시)

```bash
# .env 파일 생성
cat > /opt/calender/app/.env << EOF
SPRING_DATASOURCE_URL=jdbc:postgresql://calender-db.xxxx.rds.amazonaws.com:5432/calender
SPRING_DATASOURCE_USERNAME=postgres
SPRING_DATASOURCE_PASSWORD=$(openssl rand -base64 32)

JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRATION=3600000
JWT_REFRESH_EXPIRATION=86400000

GOOGLE_CLIENT_ID=YOUR_BACKEND_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET

HOLIDAY_API_KEY=YOUR_HOLIDAY_API_KEY
HOLIDAY_API_URL=http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo

SERVER_PORT=8080
LOGGING_LEVEL_ROOT=INFO
EOF

chmod 600 /opt/calender/app/.env
```

### 8.3 Java에서 환경 변수 로드

```java
// backend/src/main/java/com/calendar/config/EnvConfig.java
@Configuration
public class EnvConfig {
    @Value("${spring.datasource.url}")
    private String dbUrl;
    
    @Value("${jwt.secret}")
    private String jwtSecret;
    
    @Value("${google.client-id}")
    private String googleClientId;
    
    // 설정 로드 확인
    @PostConstruct
    public void logConfig() {
        log.info("Database URL: {}", dbUrl);
        log.info("JWT configured: {}", !jwtSecret.isEmpty());
        log.info("Google OAuth configured: {}", !googleClientId.isEmpty());
    }
}
```

---

## 📋 환경 변수 체크리스트

### 개발 환경 ✅
- [ ] `electrode/.env.development` 생성
- [ ] `react-native/.env.development` 생성
- [ ] 로컬 PostgreSQL 설정
- [ ] Google OAuth 클라이언트 ID 설정
- [ ] 공휴일 API 키 설정

### 프로덕션 환경 ✅
- [ ] `electron/.env.production` 생성
- [ ] `react-native/.env.production` 생성
- [ ] AWS RDS PostgreSQL 설정
- [ ] JWT 시크릿 생성 (강력한 랜덤 문자열)
- [ ] Google OAuth 클라이언트 ID/시크릿 설정
- [ ] 공휴일 API 키 설정
- [ ] SSL 인증서 설정 (Let's Encrypt)
- [ ] DDNS 도메인 설정
- [ ] 포트 포워딩 설정
- [ ] Caddy/Nginx 설정

---

## 🔐 보안 주의사항

### ❌ 절대 하지 말 것
```bash
# ❌ 절대 금지
git add .env
git add secret.json
echo "API_KEY=xxx" >> file.js

# ❌ 콘솔에 노출
console.log(process.env.JWT_SECRET)

# ❌ 클라이언트에 전송
response.send({ apiKey: process.env.API_KEY })
```

### ✅ 올바른 방법
```bash
# ✅ .gitignore에 추가
echo ".env*" >> .gitignore
echo "*.secret" >> .gitignore
echo "oauth-credentials.json" >> .gitignore

# ✅ 환경 변수 사용
const secret = process.env.JWT_SECRET;

# ✅ 보안 vault 사용
# AWS Secrets Manager, HashiCorp Vault 등

# ✅ 권한 제한
chmod 600 .env
```

---

## 🧪 환경 변수 검증

### Backend 검증
```bash
cd backend

# 설정 출력
./mvnw -q exec:java -Dexec.mainClass="...ConfigValidator"

# 데이터베이스 연결 확인
./mvnw test -Dtest=DatabaseConnectionTest
```

### Electron 검증
```bash
cd electron

# 환경 변수 확인
npm run env:check

# OAuth 설정 확인
npm run oauth:check
```

### React Native 검증
```bash
cd react-native

# 환경 변수 확인
npm run env:check

# 빌드 전 검증
npm run prebuild
```

---

## 📞 문제 해결

### "API 키가 유효하지 않습니다"
```bash
# 1. 환경 변수 확인
echo $HOLIDAY_API_KEY

# 2. API 직접 테스트
curl "http://apis.data.go.kr/B090041/...?serviceKey=$HOLIDAY_API_KEY"

# 3. 공공데이터포털에서 API 키 재발급
```

### "데이터베이스 연결 실패"
```bash
# 1. PostgreSQL 실행 확인
psql -U postgres

# 2. 데이터베이스 존재 확인
\l

# 3. 사용자 권한 확인
\du

# 4. 포트 확인
netstat -an | grep 5432
```

### "Google OAuth 실패"
```bash
# 1. 클라이언트 ID 확인
cat electrode/src/config/oauth-credentials.json

# 2. 리다이렉트 URI 확인
# Google Cloud Console → OAuth 동의 화면 → 리다이렉트 URI

# 3. 콘솔 오류 확인
npm run dev -- --no-sandbox
```

---

**✅ 모든 환경 변수 설정이 완료되면 배포를 진행하세요!**
