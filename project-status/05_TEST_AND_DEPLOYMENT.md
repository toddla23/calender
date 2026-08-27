# 테스트 및 배포 가이드 (Phase 4)

**상태:** 🚀 시작 예정  
**목표 완료:** 2026-09-10  

---

## 🧪 통합 테스트 (Integration Testing)

### 1단계: 로컬 테스트 (1-2일)

#### 1.1 Desktop (Electron) 테스트
```bash
cd electron
npm start

# 테스트 시나리오
- 로그인/로그아웃
- 메모 CRUD
- 캘린더 조회
- 검색 기능
- 오프라인 모드
- 네트워크 끊김
- WebSocket 실시간 업데이트
```

#### 1.2 Mobile (React Native) 테스트
```bash
cd react-native
npm run ios     # iPhone 시뮬레이터
npm run android # Android 에뮬레이터

# 테스트 시나리오 (Desktop과 동일)
```

#### 1.3 다중 기기 테스트
```
Device A (Desktop) ↔ Device B (Mobile) ↔ Device C (Desktop)
- Device A에서 메모 생성
- Device B, C에서 <500ms 내 수신 확인
- 동기화 지연 시간 측정
- 네트워크 변화에 따른 재연결 테스트
```

---

### 2단계: 백엔드 테스트 (1일)

#### 2.1 API 엔드포인트 검증
```bash
curl -X GET http://localhost:8080/api/notes \
  -H "Authorization: Bearer $TOKEN"

# 검증 항목
- 인증 토큰 검증
- 403 Forbidden 응답
- 200 OK with notes array
- 빈 배열 처리
```

#### 2.2 WebSocket 메시지 검증
```javascript
// STOMP 클라이언트로 테스트
const client = new StompJs.Client({
  brokerURL: 'ws://localhost:8080/ws',
  onConnect: () => {
    client.subscribe('/user/userId/topic/sync', (msg) => {
      console.log(JSON.parse(msg.body));
    });
  }
});
client.activate();
```

#### 2.3 데이터 일관성 검증
```sql
-- Backend DB에서 메모 확인
SELECT * FROM notes WHERE user_id = 'test-user' ORDER BY updated_at DESC;

-- SQLite에서 메모 확인
SELECT * FROM notes ORDER BY updated_at DESC;

-- 메모 개수 및 내용이 동일한지 확인
```

---

### 3단계: 성능 테스트 (1-2일)

#### 3.1 부하 테스트
```bash
# 100개 메모 생성
for i in {1..100}; do
  curl -X POST http://localhost:8080/api/notes \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Note '$i'","content":"Content"}'
done

# 측정 항목
- 응답 시간
- 메모리 사용량
- CPU 사용률
- 데이터베이스 쿼리 시간
```

#### 3.2 실시간 업데이트 성능
```javascript
// 동시에 10개 메모 생성
const promises = Array(10).fill().map(() =>
  fetch('/api/notes', { method: 'POST', ... })
);

// 측정 항목
- 최대 지연 시간
- 평균 지연 시간
- 패킷 손실 없음
- 메모리 스파이크 없음
```

#### 3.3 네트워크 시뮬레이션
```bash
# macOS/Linux에서 네트워크 제한
sudo tc qdisc add dev lo root tbf rate 1mbit burst 32kbit latency 400ms

# 측정 항목
- 느린 네트워크에서의 동작
- 타임아웃 처리
- 재시도 로직
- 메모리 사용
```

---

## 🔒 보안 테스트

### 1. 인증 보안
- [ ] 유효하지 않은 토큰으로 API 호출 거부 확인
- [ ] 만료된 토큰 자동 갱신 확인
- [ ] 토큰 갱신 실패 시 로그아웃 확인

### 2. 데이터 보안
- [ ] 민감한 정보(토큰)가 로그에 남지 않음
- [ ] 메모리에 민감 정보 암호화 확인
- [ ] 로그아웃 시 모든 로컬 데이터 삭제 확인

### 3. 통신 보안
- [ ] HTTPS/WSS 사용 확인
- [ ] 인증서 검증 확인
- [ ] 패킷 스니핑 방지 확인

---

## 📊 회귀 테스트 (Regression Testing)

### Phase별 주요 기능 검증
```
Phase 1 (백엔드)
✓ API 엔드포인트 작동
✓ JWT 인증
✓ 데이터베이스 CRUD

Phase 2-1 (Electron 기초)
✓ IPC 채널
✓ 메인/렌더러 프로세스

Phase 2-2 (동기화 엔진)
✓ SQLite 저장
✓ REST API 연동
✓ 오프라인 저장소

Phase 2-3 (UI)
✓ 캘린더 렌더링
✓ 메모 목록
✓ 실시간 상태

Phase 2-4 (OAuth + 창)
✓ 토큰 갱신
✓ z-order 제어
✓ 투명도 조절

Phase 3-1 (WebSocket)
✓ 실시간 메모 업데이트
✓ 다중 기기 동기화
✓ 오프라인 재연결

Phase 3-2 (모바일)
✓ React Native 빌드
✓ SQLite 저장
✓ WebSocket 연결
```

---

## 📦 배포 설정

### 1. Electron 배포

#### 1.1 빌드
```bash
cd electron

# Production 빌드
npm run build

# 배포 패키지 생성
npm run dist

# 생성 파일
dist/
  ├── calender-1.0.0.exe (Windows)
  ├── calender-1.0.0.dmg (macOS)
  └── calender-1.0.0.AppImage (Linux)
```

#### 1.2 자동 업데이트 설정
```typescript
// electron/src/main/index.ts
import { autoUpdater } from 'electron-updater';

autoUpdater.checkForUpdatesAndNotify();
```

#### 1.3 코드 서명 (선택사항)
```bash
# Windows 코드 서명
signtool sign /f certificate.pfx /p password /t http://timestamp.server calender-1.0.0.exe

# macOS 코드 서명
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application" calender-1.0.0.dmg
```

---

### 2. React Native 배포

#### 2.1 iOS 배포

##### 2.1.1 빌드
```bash
cd react-native

# 프로비저닝 프로필 설정
# Xcode 또는 xcrun으로 서명 설정

# 빌드
npm run ios:build

# IPA 파일 생성
cd ios
xcodebuild -workspace Calender.xcworkspace \
  -scheme Calender \
  -configuration Release \
  -derivedDataPath build
```

##### 2.1.2 TestFlight 배포
```bash
# App Store Connect에 업로드
xcrun altool --upload-app -f Calender.ipa \
  -u apple-id@example.com \
  -p app-specific-password
```

##### 2.1.3 App Store 배포
1. TestFlight에서 테스트 완료
2. App Store Connect에서 검토 제출
3. Apple 승인 대기 (1-3일)
4. App Store에서 배포

#### 2.2 Android 배포

##### 2.2.1 빌드
```bash
cd react-native

# 릴리스 APK 생성
npm run android:build

# 또는 AAB (App Bundle)
cd android
./gradlew bundleRelease
```

##### 2.2.2 Google Play 배포
```bash
# 1. Google Play Console 설정
#    - 앱 등록
#    - 앱 서명 설정
#    - 정책 동의

# 2. 첫 번째 릴리스 (알파 트랙)
#    - 내부 테스팅
#    - 필드 테스트 (선택 사용자)

# 3. 프로덕션 릴리스
#    - 점진적 롤아웃 (5% → 25% → 50% → 100%)
#    - 오류 모니터링
#    - 사용자 리뷰 확인
```

---

## 🔄 배포 체크리스트

### 사전 배포 (Pre-deployment)
- [ ] 모든 테스트 통과
- [ ] 코드 리뷰 완료
- [ ] 문서 업데이트
- [ ] 버전 번호 업데이트
- [ ] 변경 로그 작성
- [ ] 보안 감사 완료

### 배포 (Deployment)
- [ ] 백엔드 배포
- [ ] Electron 배포
- [ ] iOS 앱 배포
- [ ] Android 앱 배포
- [ ] 모니터링 활성화

### 사후 배포 (Post-deployment)
- [ ] 에러 로그 모니터링
- [ ] 사용자 피드백 수집
- [ ] 성능 모니터링
- [ ] 핫픽스 준비
- [ ] 버전 1.1 계획

---

## 📈 모니터링 (Monitoring)

### 1. 에러 추적
```javascript
// Sentry 설정
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
  environment: 'production'
});
```

### 2. 분석
```javascript
// Google Analytics
import { getAnalytics } from "firebase/analytics";

const analytics = getAnalytics(app);
```

### 3. 성능 모니터링
```javascript
// Grafana/Prometheus
- API 응답 시간
- WebSocket 메시지 처리 시간
- 데이터베이스 쿼리 시간
- 메모리 사용량
- CPU 사용률
```

---

## 🚨 장애 대응 (Incident Management)

### 1. 심각한 버그
```
1. 즉시 핫픽스 개발
2. 긴급 테스트 (30분)
3. 배포 (1시간 이내)
```

### 2. 성능 문제
```
1. 원인 분석 (모니터링)
2. 최적화 패치
3. 테스트 (2-4시간)
4. 배포
```

### 3. 보안 이슈
```
1. 세부 사항 비공개 (NDA)
2. 즉시 패치 개발
3. 엄격한 테스트
4. 긴급 배포
```

---

## 📅 배포 일정

| 날짜 | 작업 | 예상 소요 |
|------|------|---------|
| 2026-09-01 | 통합 테스트 | 2일 |
| 2026-09-03 | 성능 테스트 | 1-2일 |
| 2026-09-05 | 보안 감사 | 1일 |
| 2026-09-06 | 백엔드 배포 | 1일 |
| 2026-09-07 | Electron 배포 | 1일 |
| 2026-09-08 | iOS 배포 | 1-3일 |
| 2026-09-09 | Android 배포 | 1-3일 |
| 2026-09-10 | 완료 🎉 | - |

---

## ✅ 배포 완료 조건

- ✅ 모든 Phase 완료 (1-3)
- ✅ 통합 테스트 통과
- ✅ 성능 목표 달성
- ✅ 보안 감사 통과
- ✅ 모든 플랫폼 배포 완료
- ✅ 모니터링 활성화

---

**목표 완성:** 2026-09-10 🎯  
**상태:** 준비 완료 ✅
