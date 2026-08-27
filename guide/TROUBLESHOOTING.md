# 🔧 문제 해결 가이드 (Troubleshooting)

**대상:** 개발자, QA, 운영팀  
**최종 업데이트:** 2026-08-27

---

## 🚀 시작 관련 문제

### 문제 1: "Port 8080 already in use"

#### 증상
```
ERROR: java.net.BindException: Address already in use (Bind failed)
```

#### 원인
- 다른 애플리케이션이 포트 8080 사용 중
- 이전 프로세스가 종료되지 않음

#### 해결책
```bash
# 1. 프로세스 확인
lsof -i :8080
# 또는
netstat -tulpn | grep 8080

# 2. 프로세스 종료
kill -9 <PID>

# 3. 포트 변경 (임시)
export SERVER_PORT=8081
./mvnw spring-boot:run
```

---

### 문제 2: "Cannot find postgresql"

#### 증상
```
ERROR: org.postgresql.util.PSQLException: Connection to localhost:5432 refused
```

#### 원인
- PostgreSQL 서버가 실행되지 않음
- 포트 5432가 닫혀있음
- 호스트명 오류

#### 해결책
```bash
# 1. PostgreSQL 상태 확인
sudo systemctl status postgresql

# 2. PostgreSQL 시작
sudo systemctl start postgresql

# 3. 연결 테스트
psql -U postgres -d postgres

# 4. 데이터베이스 확인
\l

# 5. 포트 확인
sudo netstat -tulpn | grep 5432

# 6. 연결 정보 확인
cat application.properties | grep datasource
```

---

### 문제 3: "Database calender does not exist"

#### 증상
```
ERROR: database "calender" does not exist
```

#### 원인
- 데이터베이스가 생성되지 않음
- 마이그레이션 실패

#### 해결책
```bash
# 1. PostgreSQL 접속
psql -U postgres

# 2. 데이터베이스 생성
CREATE DATABASE calender;

# 3. 사용자 생성
CREATE USER calender_user WITH PASSWORD 'password';

# 4. 권한 부여
GRANT ALL PRIVILEGES ON DATABASE calender TO calender_user;

# 5. 테이블 생성 (Flyway 마이그레이션)
exit
./mvnw flyway:migrate
```

---

## 🔗 연결 관련 문제

### 문제 4: "WebSocket connection failed"

#### 증상
```
WebSocket connection to 'ws://localhost:8080/ws' failed
```

#### 원인
- 백엔드 서버 다운
- WebSocket 포트 다름
- 인증서 문제 (WSS)

#### 해결책
```bash
# 1. 서버 상태 확인
curl http://localhost:8080/health

# 2. WebSocket 엔드포인트 확인
curl -v http://localhost:8080/ws

# 3. 로그 확인
tail -f logs/app.log | grep -i websocket

# 4. 방화벽 확인 (WSS/8443)
sudo ufw allow 8080
sudo ufw allow 8443
```

---

### 문제 5: "Cannot connect to Electron app"

#### 증상
```
Error: Cannot find module 'electron'
```

#### 원인
- 의존성 설치 안 됨
- 잘못된 Node 버전

#### 해결책
```bash
# 1. Node 버전 확인
node --version
# v18.x.x 이상 필요

# 2. 의존성 재설치
cd electron
rm -rf node_modules
npm install

# 3. 캐시 정리
npm cache clean --force

# 4. 재설치
npm install
```

---

### 문제 6: "React Native connection failed"

#### 증상
```
Fetch error: Network request failed
```

#### 원인
- 시뮬레이터 네트워크 설정
- 백엔드 URL 오류
- 방화벽 차단

#### 해결책
```bash
# 1. 시뮬레이터 네트워크 확인
# iOS: Settings → Network
# Android: Settings → System → Developer options

# 2. 백엔드 URL 확인
# 환경 변수 확인:
cat .env | grep API_URL

# 3. 시뮬레이터에서 호스트 접근
# iOS: http://localhost:8080 → 불가
# iOS: http://<your-ip>:8080 → 가능
# Android: http://10.0.2.2:8080 → 가능

# 4. URL 변경 (개발)
export REACT_NATIVE_BACKEND_URL=http://<your-ip>:8080
npm run android
```

---

## 🔐 인증 관련 문제

### 문제 7: "Invalid token"

#### 증상
```json
{
  "error": "Unauthorized",
  "message": "Invalid or expired token"
}
```

#### 원인
- 토큰 만료
- 토큰 형식 오류
- 서명 키 불일치

#### 해결책
```bash
# 1. 토큰 확인
echo $TOKEN

# 2. 토큰 디코드
# jwt.io에서 확인

# 3. 토큰 갱신
curl -X POST http://localhost:8080/auth/refresh \
  -H "Authorization: Bearer $REFRESH_TOKEN"

# 4. 다시 로그인
# 브라우저에서 OAuth 재인증
```

---

### 문제 8: "OAuth callback failed"

#### 증상
```
OAuth callback error: invalid_grant
```

#### 원인
- OAuth 클라이언트 ID 오류
- Redirect URI 불일치
- 토큰 만료

#### 해결책
```bash
# 1. 환경 변수 확인
echo $OAUTH_CLIENT_ID
echo $OAUTH_CLIENT_SECRET

# 2. Redirect URI 확인
# Google Cloud Console에서 설정된 URI와 일치 확인

# 3. 로그 확인
grep "OAuth" logs/app.log

# 4. 테스트 클라이언트 ID로 변경
# development: 테스트 클라이언트
# production: 정식 클라이언트
```

---

## 💾 데이터 관련 문제

### 문제 9: "Note not syncing"

#### 증상
```
메모를 생성했으나 다른 기기에 표시되지 않음
```

#### 원인
- WebSocket 연결 안 됨
- 동기화 큐 가득 참
- 서버 에러

#### 해결책
```bash
# 1. WebSocket 상태 확인
DevTools → Network → WS
# 초록색 표시 확인

# 2. 동기화 로그 확인
console.log(syncStore.status)

# 3. 데이터베이스 확인
psql -U postgres -d calender
SELECT * FROM notes WHERE id = 'note-id';

# 4. 서버 로그 확인
tail -f logs/app.log | grep -i sync

# 5. 브라우저 캐시 정리
# DevTools → Application → Clear Storage
```

---

### 문제 10: "Offline notes not syncing"

#### 증상
```
오프라인에서 생성한 메모가 동기화되지 않음
```

#### 원인
- SQLite 저장 실패
- 네트워크 복구 인식 안 됨
- 토큰 만료

#### 해결책
```bash
# 1. SQLite 상태 확인
# DevTools → Application → IndexedDB/Storage

# 2. 네트워크 상태 확인
console.log(navigator.onLine)

# 3. 수동 동기화
window.electron.ipc.invoke('sync:push-notes')

# 4. 오프라인 메모 확인
SELECT COUNT(*) FROM notes WHERE synced = false;

# 5. 강제 동기화
# 앱 종료 후 재시작
```

---

## 📊 성능 관련 문제

### 문제 11: "App is slow"

#### 증상
```
메모 목록 로드 느림, 응답 지연
```

#### 원인
- 데이터 많음 (1000+ 메모)
- 인덱스 없음
- 메모리 누수

#### 해결책
```bash
# 1. 데이터베이스 인덱스 생성
psql -U postgres -d calender
CREATE INDEX idx_notes_userid ON notes(user_id);
CREATE INDEX idx_notes_updatedat ON notes(updated_at);

# 2. 쿼리 성능 확인
EXPLAIN ANALYZE SELECT * FROM notes WHERE user_id = 'user-123';

# 3. 메모리 확인
# DevTools → Memory → Take snapshot

# 4. 메모리 누수 테스트
# 같은 작업 반복 후 메모리 증가 확인

# 5. 대량 데이터 처리
# 페이징 적용
# Limit 50으로 설정
```

---

### 문제 12: "High CPU usage"

#### 증상
```
CPU 사용률 70% 이상
```

#### 원인
- WebSocket 메시지 폭주
- 동기화 루프 무한 반복
- 데이터베이스 락

#### 해결책
```bash
# 1. 프로세스 확인
top -b -n 1 | grep calender

# 2. 스레드 확인
jps -l
jstack <PID> | grep -i cpu

# 3. WebSocket 메시지 확인
# DevTools → Network → WS → Messages

# 4. 동기화 로그 확인
tail -f logs/app.log | grep -i sync

# 5. 데이터베이스 락 확인
psql -U postgres -d calender
SELECT * FROM pg_locks;

# 6. 재시작
sudo systemctl restart calender
```

---

## 🐛 특정 에러 해결

### 문제 13: "Pull_in_progress stuck"

#### 증상
```
메모 생성 중지됨, 동기화 안 됨
```

#### 원인
- 강제 종료 중 동기화 중
- 데이터베이스 충돌

#### 해결책
```bash
# 1. 상태 확인
SELECT * FROM sync_state WHERE user_id = 'user-123';

# 2. 상태 초기화
UPDATE sync_state SET pull_in_progress = false WHERE user_id = 'user-123';

# 3. 앱 재시작
# Electron: 앱 종료 후 재시작
# 자동 정리 로직 실행
```

---

### 문제 14: "Token refresh loop"

#### 증상
```
토큰 갱신이 계속 반복됨
```

#### 원인
- 리프레시 토큰 만료
- 시계 시간 불일치
- 서버 설정 오류

#### 해결책
```bash
# 1. 시간 동기화
# Windows: Settings → Time & Language → Sync now
# macOS: System Preferences → Date & Time
# Linux: sudo timedatectl set-ntp true

# 2. 토큰 확인
# jwt.io에서 exp 확인

# 3. 리프레시 토큰 갱신
# 로그아웃 후 재로그인

# 4. 서버 시간 확인
date
# 서버와 클라이언트 시간 맞추기
```

---

## 🔍 로그 분석

### 백엔드 로그 확인
```bash
# 전체 로그
tail -f logs/app.log

# 에러만 필터
grep ERROR logs/app.log

# 특정 시간대 필터
grep "2026-08-27 12:" logs/app.log

# 특정 기능 필터
grep -i websocket logs/app.log
grep -i oauth logs/app.log
```

### DevTools 콘솔 활용
```javascript
// 동기화 상태 확인
console.log(window.__syncEngine.status)

// WebSocket 상태 확인
console.log(window.__wsClient.connected)

// 마지막 에러 확인
console.log(window.__lastError)
```

---

## 📞 지원 요청

문제 해결 안 될 시:

1. **로그 수집**
   - 서버 로그: `/opt/calender/logs/app.log`
   - DevTools 콘솔: Ctrl+Shift+I
   - 에러 메시지 전체 복사

2. **정보 제공**
   - OS: Windows/macOS/Linux
   - Node 버전: `node --version`
   - 에러 발생 시간
   - 재현 단계

3. **이슈 생성**
   - GitHub Issues에 보고
   - 또는 팀 Slack #bugs 채널에 공유

---

**문제 해결 안 되면 언제든 도움 요청하세요!** 💪
