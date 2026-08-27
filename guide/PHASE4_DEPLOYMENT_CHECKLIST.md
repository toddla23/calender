# ✅ Phase 4 배포 최종 체크리스트

**대상:** 배포 담당자  
**상태:** 시작 준비 완료 (87.5% → 배포 단계)  
**예상 기간:** 5-7일  
**마지막 업데이트:** 2026-08-27

---

## 📊 배포 단계 개요

```
Phase 4: 배포 준비
├── [1단계] API 키 및 환경 설정 (1-2시간)
│   ├── Google OAuth
│   ├── 공휴일 API
│   ├── PostgreSQL
│   └── 환경 변수
│
├── [2단계] 빌드 및 테스트 (2-3시간)
│   ├── Backend 빌드
│   ├── Electron 빌드
│   ├── React Native 빌드
│   └── 통합 테스트
│
├── [3단계] 홈서버 준비 (1-2시간)
│   ├── DDNS 설정
│   ├── 포트 포워딩
│   ├── SSL 인증서
│   └── 리버스 프록시
│
├── [4단계] 백엔드 배포 (30분-1시간)
│   ├── Systemd 서비스
│   ├── 데이터베이스 마이그레이션
│   ├── 헬스 체크
│   └── 모니터링
│
└── [5단계] 클라이언트 배포 (2-3시간)
    ├── Electron 배포
    ├── iOS TestFlight
    ├── Android 알파
    └── 최종 검증
```

---

## [1단계] API 키 및 환경 설정

### 1️⃣ Google OAuth 설정

**시간 예상:** 30분  
**담당자:** API 담당

#### 작업 목록
- [ ] Google Cloud Console 프로젝트 생성
- [ ] Google+ API 활성화
- [ ] OAuth 동의 화면 구성
  - [ ] 앱 이름: "Calendar App"
  - [ ] 사용자 지원 이메일: 입력
  - [ ] 개발자 연락처: 입력
- [ ] OAuth 클라이언트 ID 생성 (3개)
  - [ ] Electron용 (데스크톱 애플리케이션)
    ```
    저장 위치: electron/src/config/oauth-credentials.json
    클라이언트 ID: ___________________________
    클라이언트 시크릿: ___________________________
    ```
  - [ ] React Native용 (데스크톱 애플리케이션)
    ```
    저장 위치: react-native/src/config/oauth-credentials.json
    클라이언트 ID: ___________________________
    클라이언트 시크릿: ___________________________
    ```
  - [ ] Backend용 (웹 애플리케이션)
    ```
    클라이언트 ID: ___________________________
    클라이언트 시크릿: ___________________________
    리다이렉트 URI: https://my-calendar.duckdns.org/callback
    ```

#### 검증 체크
```bash
# OAuth 자격증명 파일 확인
ls -la electron/src/config/oauth-credentials.json
cat electron/src/config/oauth-credentials.json | jq .

# 클라이언트 ID 형식 확인
grep -E "\.apps\.googleusercontent\.com" electron/src/config/oauth-credentials.json
```

---

### 2️⃣ 공휴일 API 설정

**시간 예상:** 20분  
**담당자:** API 담당

#### 작업 목록
- [ ] 공공데이터포털 회원가입
  - URL: https://www.data.go.kr/
  - [ ] 이메일: ___________________________
  - [ ] 비밀번호: ___________________________
  
- [ ] "특일정보" 검색 및 활용신청
  - [ ] 승인 대기 (보통 24시간)
  
- [ ] API 키 확인
  ```
  API 키: ___________________________
  서비스 키: https://www.data.go.kr/...
  ```

- [ ] Backend 환경 변수 설정
  ```bash
  export HOLIDAY_API_KEY="YOUR_API_KEY"
  export HOLIDAY_API_URL="http://apis.data.go.kr/B090041/..."
  ```

#### 검증 체크
```bash
# API 호출 테스트
curl "http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=$HOLIDAY_API_KEY&solYear=2026&numOfRows=10"

# 응답 확인
# <holidays> <item> <locdate>20260101</locdate> <dateName>신정</dateName> </item> </holidays>
```

---

### 3️⃣ PostgreSQL 데이터베이스 설정

**시간 예상:** 45분  
**담당자:** DBA

#### 개발 환경 설정 ✅ (이미 진행됨)
- [x] PostgreSQL 설치
- [x] 로컬 데이터베이스 생성
- [x] 테이블 스키마 생성

#### 프로덕션 환경 설정 (지금)
- [ ] AWS RDS 생성 또는 전용 서버 준비
  ```
  옵션 A: AWS RDS (권장)
  - 인스턴스 클래스: db.t3.micro
  - 엔진: PostgreSQL 14.x
  - 스토리지: 20GB
  - 다중 AZ: 아니오 (개인 프로젝트)
  
  옵션 B: 독립 서버
  - Ubuntu 20.04 LTS
  - PostgreSQL 14.x
  ```

- [ ] 데이터베이스 & 사용자 생성
  ```bash
  # 프로덕션 사용자
  DB_USERNAME: calender_prod
  DB_PASSWORD: _________________________ (강한 암호)
  DB_NAME: calender
  DB_HOST: _________________________ (RDS 엔드포인트 또는 서버 IP)
  DB_PORT: 5432
  ```

- [ ] 스키마 마이그레이션
  ```bash
  # 프로덕션 서버에서 실행
  psql -U calender_prod -d calender -h $DB_HOST << EOF
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
  
  CREATE INDEX idx_notes_user_id ON notes(user_id);
  CREATE INDEX idx_notes_date ON notes(date);
  CREATE INDEX idx_notes_updated_at ON notes(updated_at);
  EOF
  ```

- [ ] 환경 변수 설정
  ```bash
  export SPRING_DATASOURCE_URL="jdbc:postgresql://$DB_HOST:5432/calender"
  export SPRING_DATASOURCE_USERNAME="calender_prod"
  export SPRING_DATASOURCE_PASSWORD="$DB_PASSWORD"
  ```

#### 검증 체크
```bash
# 연결 확인
psql -U calender_prod -d calender -h $DB_HOST -c "SELECT 1"

# 테이블 생성 확인
psql -U calender_prod -d calender -h $DB_HOST -c "\dt"

# 사용자 확인
psql -U calender_prod -d calender -h $DB_HOST -c "\du"
```

---

### 4️⃣ JWT 설정

**시간 예상:** 10분  
**담당자:** 보안 담당

#### JWT 시크릿 생성
- [ ] 강력한 랜덤 문자열 생성
  ```bash
  # 32바이트 랜덤 문자열 (hex)
  export JWT_SECRET=$(openssl rand -hex 32)
  echo $JWT_SECRET
  
  # 결과 예시:
  # a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6
  
  저장 위치: _________________________
  ```

#### JWT 설정값
- [ ] JWT_SECRET 저장
- [ ] JWT_EXPIRATION 설정 (기본값: 1시간)
  ```
  JWT_EXPIRATION=3600000 (밀리초)
  ```

- [ ] JWT_REFRESH_EXPIRATION 설정 (기본값: 24시간)
  ```
  JWT_REFRESH_EXPIRATION=86400000 (밀리초)
  ```

---

### 5️⃣ 환경 변수 파일 생성

**시간 예상:** 20분  
**담당자:** DevOps

#### Backend 환경 변수
- [ ] 파일 생성: `backend/.env.production`
  ```bash
  # Database
  SPRING_DATASOURCE_URL=jdbc:postgresql://...
  SPRING_DATASOURCE_USERNAME=calender_prod
  SPRING_DATASOURCE_PASSWORD=...
  
  # JWT
  JWT_SECRET=...
  JWT_EXPIRATION=3600000
  JWT_REFRESH_EXPIRATION=86400000
  
  # Google OAuth
  GOOGLE_CLIENT_ID=...
  GOOGLE_CLIENT_SECRET=...
  
  # 공휴일 API
  HOLIDAY_API_KEY=...
  HOLIDAY_API_URL=...
  
  # Server
  SERVER_PORT=8080
  LOGGING_LEVEL_ROOT=INFO
  ```

#### Electron 환경 변수
- [ ] 파일 생성: `electron/.env.production`
  ```bash
  API_URL=https://my-calendar.duckdns.org
  WS_URL=wss://my-calendar.duckdns.org/ws
  GOOGLE_CLIENT_ID=...
  DEBUG=false
  ```

#### React Native 환경 변수
- [ ] 파일 생성: `react-native/.env.production`
  ```bash
  API_BASE_URL=https://my-calendar.duckdns.org
  WS_URL=wss://my-calendar.duckdns.org/ws
  GOOGLE_CLIENT_ID=...
  DEBUG=false
  ```

---

## [2단계] 빌드 및 테스트

### 1️⃣ Backend 빌드

**시간 예상:** 15분  
**담당자:** Backend 개발자

#### 사전 요구사항
- [ ] Java 17+ 설치 확인
  ```bash
  java -version
  # openjdk 17.0.x
  ```

- [ ] Gradle 또는 Maven 설치 확인
  ```bash
  ./gradlew --version
  # 또는
  ./mvnw --version
  ```

#### 빌드 실행
- [ ] 디렉토리 이동
  ```bash
  cd /home/ec2-user/projects/calender/backend
  ```

- [ ] 프로덕션 빌드
  ```bash
  export SPRING_PROFILES_ACTIVE=prod
  source ../.env.production
  
  ./gradlew clean build -x test
  # 또는
  ./mvnw clean package -DskipTests -Pprod
  ```

- [ ] 빌드 산출물 확인
  ```bash
  # Gradle
  ls -lh build/libs/calender-*.jar
  # 크기: 50-100MB
  
  # Maven
  ls -lh target/calender-*.jar
  ```

#### 검증
- [ ] JAR 파일 크기 확인
  ```bash
  [ $(stat -f%z build/libs/calender-*.jar) -gt 50000000 ] && echo "✅ 크기 OK" || echo "❌ 크기 작음"
  ```

- [ ] 매니페스트 확인
  ```bash
  jar tf build/libs/calender-*.jar | wc -l
  # 출력: 2000+ 파일
  ```

- [ ] 로컬 실행 테스트 (선택)
  ```bash
  java -jar build/libs/calender-*.jar
  # "Tomcat started on port(s): 8080"
  ```

---

### 2️⃣ Electron 빌드

**시간 예상:** 20분  
**담당자:** Frontend 개발자

#### 사전 요구사항
- [ ] Node.js 18+ 설치 확인
  ```bash
  node --version
  npm --version
  ```

#### 의존성 설치
- [ ] npm install
  ```bash
  cd electron
  npm install
  ```

- [ ] 설치 확인
  ```bash
  npm list electron
  # calendar-electron@1.0.0
  ```

#### 프로덕션 빌드
- [ ] 환경 변수 설정
  ```bash
  export NODE_ENV=production
  source .env.production
  ```

- [ ] TypeScript 컴파일
  ```bash
  npm run tsc
  # 0 errors
  ```

- [ ] 빌드 실행
  ```bash
  npm run build
  ```

- [ ] 산출물 확인
  ```bash
  ls -lh dist/
  # Windows: calendar-1.0.0.exe (~150MB)
  # macOS: calendar-1.0.0.dmg (~180MB)
  # Linux: calendar-1.0.0.AppImage (~140MB)
  ```

#### 검증
- [ ] 파일 크기 확인
  ```bash
  [ -f dist/calendar-*.exe ] && echo "✅ Windows 빌드 OK" || echo "❌ Windows 빌드 실패"
  ```

- [ ] 서명 확인 (Windows)
  ```bash
  # 향후 코드 서명 추가 예정
  ```

---

### 3️⃣ React Native 빌드

**시간 예상:** 25분  
**담당자:** Mobile 개발자

#### 사전 요구사항
- [ ] Node.js 18+ 설치
- [ ] Xcode 14+ 설치 (iOS)
- [ ] Android Studio 설치 (Android)

#### 의존성 설치
- [ ] npm install
  ```bash
  cd react-native
  npm install
  ```

- [ ] Pod 설치 (iOS)
  ```bash
  cd ios
  pod install
  cd ..
  ```

#### iOS 빌드
- [ ] 환경 변수 설정
  ```bash
  export ENVFILE=.env.production
  ```

- [ ] 번들 생성
  ```bash
  npm run bundle:ios
  ```

- [ ] Xcode 빌드
  ```bash
  xcodebuild \
    -workspace ios/Calender.xcworkspace \
    -scheme Calender \
    -configuration Release \
    -derivedDataPath build
  ```

- [ ] 산출물 확인
  ```bash
  [ -d "build" ] && echo "✅ iOS 빌드 OK" || echo "❌ iOS 빌드 실패"
  ```

#### Android 빌드
- [ ] 환경 변수 설정
  ```bash
  export ENVFILE=.env.production
  ```

- [ ] AAB 빌드
  ```bash
  npm run android:bundle
  ```

- [ ] 산출물 확인
  ```bash
  ls -lh android/app/build/outputs/bundle/release/
  # app-release.aab (~50MB)
  ```

#### 검증
- [ ] iOS 빌드 확인
- [ ] Android 빌드 확인

---

### 4️⃣ 통합 테스트

**시간 예상:** 45분  
**담당자:** QA

#### 테스트 환경 설정
- [ ] Backend 로컬 실행
  ```bash
  cd backend
  java -jar build/libs/calender-*.jar &
  ```

- [ ] API 테스트
  ```bash
  curl -X GET http://localhost:8080/api/health
  # { "status": "UP" }
  ```

#### 테스트 케이스
- [ ] 로그인 테스트
  - [ ] Google OAuth 로그인
  - [ ] 토큰 자동 갱신
  - [ ] 로그아웃

- [ ] 메모 CRUD 테스트
  - [ ] 메모 생성
  - [ ] 메모 조회
  - [ ] 메모 수정
  - [ ] 메모 삭제

- [ ] 동기화 테스트
  - [ ] REST 동기화 (Push/Pull)
  - [ ] WebSocket 실시간 동기화
  - [ ] 오프라인 모드

- [ ] 다중 기기 테스트
  - [ ] Electron + React Native 동시 접속
  - [ ] 변경사항 실시간 동기화

#### 테스트 결과 기록
```
테스트 케이스 | 상태 | 노트
------------|------|-----
로그인      | ✅ PASS | -
메모 생성   | ✅ PASS | -
메모 수정   | ✅ PASS | -
메모 삭제   | ✅ PASS | -
동기화      | ✅ PASS | -
실시간 반영 | ✅ PASS | -
```

---

## [3단계] 홈서버 준비

### 1️⃣ DDNS 설정

**시간 예상:** 20분  
**담당자:** 네트워크 담당

#### DuckDNS 설정
- [ ] 회원가입 및 도메인 생성
  - URL: https://www.duckdns.org/
  - 도메인명: `my-calendar` → `my-calendar.duckdns.org`
  - 토큰: _________________________

- [ ] 초기 IP 설정
  ```bash
  # 공인 IP 확인
  PUBLIC_IP=$(curl -s https://api.ipify.org)
  echo $PUBLIC_IP
  
  # DuckDNS에 IP 등록
  curl "https://www.duckdns.org/update?domains=my-calendar&token=$TOKEN&ip=$PUBLIC_IP"
  ```

- [ ] 자동 갱신 스크립트 설정
  ```bash
  # Linux/macOS: Cron 작업
  mkdir -p ~/duckdns
  cat > ~/duckdns/update.sh << 'SCRIPT'
  #!/bin/bash
  curl "https://www.duckdns.org/update?domains=my-calendar&token=$TOKEN&ip=$(curl -s https://api.ipify.org)"
  SCRIPT
  
  chmod +x ~/duckdns/update.sh
  
  # Cron 등록 (매 5분)
  crontab -e
  # 추가: */5 * * * * /home/user/duckdns/update.sh >> /dev/null 2>&1
  ```

#### 검증
- [ ] 도메인 연결 확인
  ```bash
  nslookup my-calendar.duckdns.org
  # Address: [공인 IP]
  ```

---

### 2️⃣ 포트 포워딩

**시간 예상:** 15분  
**담당자:** 네트워크 담당

#### 공유기 설정
- [ ] 공유기 관리 페이지 접속
  ```
  주소: 192.168.1.1 (또는 192.168.0.1)
  사용자명: admin
  비밀번호: [공유기 기본 비밀번호]
  ```

- [ ] 포트 포워딩 규칙 추가
  ```
  규칙 1:
    외부 포트: 443 (HTTPS)
    프로토콜: TCP
    내부 IP: 192.168.1.100 (백엔드 서버)
    내부 포트: 8080
  
  규칙 2:
    외부 포트: 80 (HTTP)
    프로토콜: TCP
    내부 IP: 192.168.1.100
    내부 포트: 8080
  ```

#### 검증
- [ ] 외부 포트 개방 확인
  ```bash
  # PortChecker 등의 온라인 도구 사용
  https://www.yougetsignal.com/tools/open-ports/
  # 포트 443 입력 → OPEN 확인
  ```

---

### 3️⃣ SSL 인증서 (Let's Encrypt)

**시간 예상:** 20분  
**담당자:** 네트워크 담당

#### Caddy 설치
- [ ] 설치
  ```bash
  # macOS
  brew install caddy
  
  # Ubuntu/Debian
  sudo apt-get install caddy
  
  # Windows
  # https://github.com/caddyserver/caddy/releases 다운로드
  ```

#### Caddyfile 설정
- [ ] 파일 생성: `/etc/caddy/Caddyfile`
  ```
  my-calendar.duckdns.org:443 {
    reverse_proxy 127.0.0.1:8080
    
    @websocket {
      header Connection *Upgrade*
      header Upgrade websocket
    }
    reverse_proxy @websocket 127.0.0.1:8080
    
    log {
      output file /var/log/caddy/access.log
    }
  }
  
  my-calendar.duckdns.org:80 {
    redir https://{host}{uri} permanent
  }
  ```

- [ ] Caddy 시작
  ```bash
  sudo caddy start
  # 자동으로 Let's Encrypt 인증서 발급
  ```

- [ ] 인증서 확인
  ```bash
  # 자동 생성 위치
  ~/.local/share/caddy/certificates/
  
  # 또는
  sudo caddy list-uses
  ```

#### 검증
- [ ] HTTPS 연결 확인
  ```bash
  curl -I https://my-calendar.duckdns.org/api/health
  # HTTP/2 200
  ```

- [ ] SSL 인증서 확인
  ```bash
  openssl s_client -connect my-calendar.duckdns.org:443 -servername my-calendar.duckdns.org
  # subject=CN = my-calendar.duckdns.org
  ```

---

## [4단계] 백엔드 배포

### 1️⃣ 배포 디렉토리 준비

**시간 예상:** 10분  
**담당자:** DevOps

#### 디렉토리 생성
```bash
sudo mkdir -p /opt/calender/app
sudo mkdir -p /opt/calender/logs
sudo mkdir -p /opt/calender/backups

# 권한 설정
sudo chown -R $USER:$USER /opt/calender
chmod 755 /opt/calender/app
chmod 755 /opt/calender/logs
```

#### 확인
- [ ] 디렉토리 생성 확인
  ```bash
  ls -la /opt/calender/
  ```

---

### 2️⃣ JAR 파일 배포

**시간 예상:** 5분  
**담당자:** DevOps

#### 파일 복사
- [ ] JAR 파일 복사
  ```bash
  cp backend/build/libs/calender-*.jar /opt/calender/app/calender.jar
  chmod +x /opt/calender/app/calender.jar
  ```

- [ ] 환경 변수 파일 복사
  ```bash
  cp backend/.env.production /opt/calender/app/.env
  chmod 600 /opt/calender/app/.env
  ```

#### 확인
- [ ] 파일 존재 확인
  ```bash
  ls -la /opt/calender/app/
  # -rwxr-xr-x calender.jar
  # -rw------- .env
  ```

---

### 3️⃣ Systemd 서비스 등록

**시간 예상:** 10분  
**담당자:** DevOps

#### 서비스 파일 생성
- [ ] 파일 생성: `/etc/systemd/system/calender.service`
  ```ini
  [Unit]
  Description=Calendar App Backend
  After=network.target
  
  [Service]
  Type=simple
  User=$USER
  WorkingDirectory=/opt/calender/app
  EnvironmentFile=/opt/calender/app/.env
  ExecStart=/usr/bin/java -Xmx512m -Xms256m -jar calender.jar
  Restart=on-failure
  RestartSec=10
  StandardOutput=append:/opt/calender/logs/app.log
  StandardError=append:/opt/calender/logs/error.log
  
  [Install]
  WantedBy=multi-user.target
  ```

#### 서비스 시작
- [ ] 데몬 리로드
  ```bash
  sudo systemctl daemon-reload
  ```

- [ ] 서비스 활성화
  ```bash
  sudo systemctl enable calender
  ```

- [ ] 서비스 시작
  ```bash
  sudo systemctl start calender
  ```

#### 확인
- [ ] 서비스 상태 확인
  ```bash
  sudo systemctl status calender
  # ● calender.service - Calendar App Backend
  #   Loaded: loaded
  #   Active: active (running)
  ```

- [ ] 로그 확인
  ```bash
  tail -f /opt/calender/logs/app.log
  # Started CalenderApplication in X seconds
  # Tomcat started on port(s): 8080
  ```

---

### 4️⃣ 데이터베이스 마이그레이션

**시간 예상:** 5분  
**담당자:** DBA

#### 스키마 검증
- [ ] 테이블 생성 확인
  ```bash
  psql -U calender_prod -d calender -h $DB_HOST -c "\dt"
  # List of relations
  #  Schema | Name | Type | Owner
  # --------|------|------|-------
  #  public | notes | table | calender_prod
  #  public | sync_meta | table | calender_prod
  #  public | users | table | calender_prod
  ```

---

### 5️⃣ 헬스 체크

**시간 예상:** 5분  
**담당자:** QA

#### API 테스트
- [ ] 헬스 체크 엔드포인트
  ```bash
  curl -X GET https://my-calendar.duckdns.org/api/health
  # { "status": "UP" }
  ```

- [ ] 데이터베이스 연결
  ```bash
  curl -X GET https://my-calendar.duckdns.org/api/notes \
    -H "Authorization: Bearer test_token"
  # 401 또는 400 (인증 실패는 정상)
  ```

- [ ] WebSocket 연결
  ```bash
  # 클라이언트에서 앱 실행
  # 연결 로그 확인
  tail -f /opt/calender/logs/app.log | grep WebSocket
  ```

---

## [5단계] 클라이언트 배포

### 1️⃣ Electron 배포

**시간 예상:** 30분  
**담당자:** Frontend 개발자

#### GitHub Releases 생성
- [ ] 릴리스 생성
  ```bash
  gh release create v1.0.0 \
    dist/calender-1.0.0.exe \
    dist/calender-1.0.0.dmg \
    dist/calender-1.0.0.AppImage \
    -t "Release v1.0.0" \
    -n "Production release"
  ```

- [ ] 또는 S3에 업로드
  ```bash
  aws s3 cp dist/ s3://calender-releases/ --recursive
  ```

#### 자동 업데이트 설정
- [ ] `electron-builder.json` 확인
  ```json
  {
    "publish": {
      "provider": "github",
      "owner": "your-org",
      "repo": "calender"
    }
  }
  ```

#### 검증
- [ ] 사용자 PC에 설치
- [ ] 로그인 확인
- [ ] 메모 작성 및 동기화 확인

---

### 2️⃣ iOS 배포 (TestFlight)

**시간 예상:** 45분 (+ Apple 검토 1-3일)  
**담당자:** iOS 개발자

#### TestFlight 업로드
- [ ] IPA 파일 생성
  ```bash
  xcodebuild \
    -exportArchive \
    -archivePath build/Calender.xcarchive \
    -exportPath build/Release \
    -exportOptionsPlist ExportOptions.plist
  ```

- [ ] App Store Connect에 업로드
  ```bash
  xcrun altool --upload-app \
    -f build/Release/Calender.ipa \
    -t iOS \
    -u apple-id@example.com \
    -p app-specific-password
  ```

#### TestFlight 테스트
- [ ] App Store Connect 접속
- [ ] TestFlight 탭 확인
- [ ] 테스트자 초대 (20명)
- [ ] 1-2주 테스트 기간

#### 앱 스토어 배포
- [ ] 앱 정보 작성
- [ ] 스크린샷 추가
- [ ] 검수 신청
- [ ] Apple 승인 대기 (1-3일)

---

### 3️⃣ Android 배포 (Google Play)

**시간 예상:** 45분  
**담당자:** Android 개발자

#### Google Play 앱 등록
- [ ] Google Play Console 접속
- [ ] 새 앱 생성
  ```
  앱 이름: Calendar App
  기본 언어: 한국어
  앱 또는 게임: 앱
  비즈니스 앱인가: 아니오
  ```

- [ ] 앱 정보 작성
  - [ ] 앱 설명
  - [ ] 스크린샷 (5-8장)
  - [ ] 앱 아이콘 (512x512)
  - [ ] 기능 그래픽 (1024x500)

#### AAB 업로드 (내부 테스팅)
- [ ] 내부 테스팅 트랙에 업로드
  ```bash
  # Google Play Console → 버전 → 내부 테스팅
  # android/app/build/outputs/bundle/release/app-release.aab 선택
  ```

- [ ] 테스트자 추가
  ```
  최소 1명 추가 (본인)
  ```

#### 테스트 (1주)
- [ ] Google Play 앱 설치
- [ ] 기본 기능 테스트
  - [ ] 로그인
  - [ ] 메모 작성
  - [ ] 메모 동기화
  - [ ] 오프라인 모드

#### 알파 배포 (필드 테스팅)
- [ ] 같은 AAB를 알파 트랙에 업로드
- [ ] 테스터 100-500명 추가
- [ ] 1주 테스트

#### 프로덕션 배포
- [ ] 같은 AAB를 프로덕션 트랙에 업로드
- [ ] 점진적 롤아웃 설정
  ```
  1단계: 5% (1주 모니터링)
  2단계: 25% (1주 모니터링)
  3단계: 50% (1주 모니터링)
  4단계: 100% (전체 배포)
  ```

---

### 4️⃣ 최종 검증

**시간 예상:** 30분  
**담당자:** QA

#### 모든 플랫폼 테스트
- [ ] Electron
  - [ ] 로그인
  - [ ] 메모 CRUD
  - [ ] 실시간 동기화
  - [ ] 오프라인 모드

- [ ] iOS (TestFlight)
  - [ ] 설치
  - [ ] 로그인
  - [ ] 메모 작성
  - [ ] 동기화

- [ ] Android (Google Play)
  - [ ] 설치
  - [ ] 로그인
  - [ ] 메모 작성
  - [ ] 동기화

#### 다중 기기 동기화
- [ ] Electron + iOS + Android 동시 접속
- [ ] 한 기기에서 메모 생성
- [ ] 다른 기기에서 실시간 업데이트 확인

#### 성능 및 안정성
- [ ] 100개 메모 작성 후 성능 확인
- [ ] 네트워크 끊김 → 복구 테스트
- [ ] 장시간 연속 사용 테스트

---

## 📋 최종 체크리스트

### ✅ 사전 배포
- [ ] 모든 코드 컴파일 성공
- [ ] 모든 테스트 통과
- [ ] 코드 리뷰 완료
- [ ] 보안 감사 완료
- [ ] 문서 작성 완료

### ✅ 배포 중
- [ ] [1단계] API 키 설정 완료
- [ ] [2단계] 빌드 및 테스트 완료
- [ ] [3단계] 홈서버 준비 완료
- [ ] [4단계] 백엔드 배포 완료
- [ ] [5단계] 클라이언트 배포 완료

### ✅ 배포 후
- [ ] 헬스 체크 성공
- [ ] 로그 모니터링 설정
- [ ] 성능 모니터링 설정
- [ ] 사용자 피드백 수집 체계 구축
- [ ] 릴리스 노트 작성

---

## 🎉 배포 완료!

**배포 날짜:** ___________________________  
**배포 시간:** ___________________________  
**담당자:** ___________________________

### 주소
- **API:** https://my-calendar.duckdns.org/api
- **WebSocket:** wss://my-calendar.duckdns.org/ws
- **Electron:** GitHub Releases
- **iOS:** App Store (또는 TestFlight)
- **Android:** Google Play

### 첫 사용자
- 이름: ___________________________
- 이메일: ___________________________
- 피드백: ___________________________

---

**축하합니다! 🎊 Calendar App v1.0.0 배포 완료!**
