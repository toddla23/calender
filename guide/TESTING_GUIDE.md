# 🧪 테스트 가이드 (실행 매뉴얼)

**대상:** QA, 개발자, 테스트 담당자  
**마지막 업데이트:** 2026-08-27  
**예상 테스트 시간:** 8-10시간

---

## 📋 전체 테스트 계획

```
Phase 2-4 테스트 (2시간)
    ↓
Phase 3-1 테스트 (3시간)
    ↓
Phase 3-2 테스트 (2시간)
    ↓
통합 테스트 (2시간)
    ↓
성능 테스트 (1시간)
```

---

## 🚀 Phase 2-4 테스트 (2시간)

### 사전 요구사항
```bash
# 1. 디렉토리 이동
cd /home/ec2-user/projects/calender/electron

# 2. 의존성 설치 확인
npm list koffi @stomp/stompjs

# 3. 빌드 확인
npm run tsc -- --noEmit
```

---

### 테스트 1: Force Quit 복구 (30분)

**목표:** 앱 강제 종료 후 재시작 시 동기화 상태 복구

#### 1.1 준비
```bash
npm start
# 앱이 정상 시작되는지 확인
# 콘솔에 에러 없음 확인
```

#### 1.2 실행
```
1. [메뉴] → [새 메모 작성] 클릭
2. 제목: "Test Note"
3. 내용: "Testing force quit recovery"
4. [저장] 버튼 클릭 (메모가 저장 중인 상태)
5. 콘솔 보기:
   - 동기화 진행률 확인
   - pull_in_progress 상태 확인
```

#### 1.3 강제 종료
```bash
# 다른 터미널에서
pkill -9 electron
# 또는 앱 창을 강제로 닫기
```

#### 1.4 재시작
```bash
npm start
# 콘솔 로그 확인
```

#### 1.5 검증
```
✅ 체크리스트:
□ 앱 정상 시작
□ 콘솔에 "Cleaning up pull_in_progress from forced app exit" 로그 표시
□ 동기화 엔진 자동 재개
□ 메모 목록 표시됨
□ 오류 없음
```

---

### 테스트 2: Token 갱신 실패 (30분)

**목표:** 토큰 만료 시 자동 로그아웃 및 LoginPage 이동

#### 2.1 준비
```bash
npm start
# 정상 로그인 상태
```

#### 2.2 로그인 (필요시)
```
1. LoginPage 확인
2. Google OAuth 로그인
3. 메모 목록이 표시되는지 확인
```

#### 2.3 토큰 만료 시뮬레이션
```bash
# DevTools 열기: Ctrl+Shift+I (Windows/Linux) 또는 Cmd+Opt+I (macOS)
# 콘솔 탭에서 실행:

localStorage.removeItem('refreshToken')
localStorage.removeItem('accessToken')

# 또는 직접 tokenManager에 접근:
window.electron.ipc.invoke('auth:logout-required')
```

#### 2.4 검증
```
✅ 체크리스트:
□ 콘솔에 "auth:logout-required" 이벤트 표시
□ 자동으로 LoginPage로 이동
□ localStorage 모두 정리됨
□ 메모 목록 사라짐
□ 에러 없음
```

---

### 테스트 3: Windows Z-Order (30분, Windows만)

**목표:** 창을 최상위 또는 최하위로 고정

#### 3.1 준비
```
1. 다른 창을 여러 개 열어두기 (예: Chrome, VS Code)
2. Electron 앱 창 활성화
```

#### 3.2 z-order 제어 테스트
```bash
# DevTools 콘솔에서 실행

# 최상위로 고정
window.electron.ipc.invoke('window:set-level', { level: 'top' })
  .then(result => console.log('Success:', result))
  .catch(err => console.error('Error:', err))

# 결과: 창이 최상위에 올라옴
```

#### 3.3 다른 앱 활성화
```
1. Chrome 창 클릭 → 활성화
2. VS Code 창 클릭 → 활성화
3. Electron 앱 → 여전히 최상위에 있는지 확인
```

#### 3.4 최하위로 변경
```bash
# DevTools 콘솔에서 실행
window.electron.ipc.invoke('window:set-level', { level: 'bottom' })

# 결과: 창이 최하위로 내려감
```

#### 3.5 검증
```
✅ 체크리스트:
□ 최상위 설정 작동
□ 다른 앱을 클릭해도 뒤로 안 가짐
□ 최하위 설정 작동
□ 콘솔 에러 없음
```

---

### 테스트 4: 창 투명도 (30분)

**목표:** 창 투명도를 동적으로 조절

#### 4.1 준비
```bash
npm start
# 앱 시작
```

#### 4.2 투명도 80%로 설정
```bash
# DevTools 콘솔에서 실행
window.electron.ipc.invoke('window:set-opacity', { opacity: 0.8 })
  .then(result => console.log('Opacity set:', result))
```

#### 4.3 시각적 확인
```
✅ 체크리스트:
□ 창이 반투명(80%)으로 변함
□ 배경이 약간 보임
□ UI 요소는 여전히 가독성 있음
□ 텍스트 읽기 가능
```

#### 4.4 다양한 값 테스트
```bash
# 50% 투명도
window.electron.ipc.invoke('window:set-opacity', { opacity: 0.5 })

# 100% 불투명 (원래대로)
window.electron.ipc.invoke('window:set-opacity', { opacity: 1.0 })

# 10% 투명도 (거의 보이지 않음)
window.electron.ipc.invoke('window:set-opacity', { opacity: 0.1 })
```

#### 4.5 범위 테스트 (유효하지 않은 값)
```bash
# 범위 밖의 값 (무시됨)
window.electron.ipc.invoke('window:set-opacity', { opacity: 1.5 })  // 무시
window.electron.ipc.invoke('window:set-opacity', { opacity: 0 })    // 무시

# 콘솔 확인
# → 에러 없이 무시되어야 함
```

#### 4.6 검증
```
✅ 체크리스트:
□ 0.1-1.0 범위: 작동
□ 범위 밖: 무시 (에러 없음)
□ UI 반응성 정상
□ 콘솔 에러 없음
```

---

## 🌐 Phase 3-1 WebSocket 테스트 (3시간)

### 테스트 5: 단일 기기 WebSocket 연결 (30분)

#### 5.1 백엔드 시작
```bash
cd /home/ec2-user/projects/calender/backend
./mvnw spring-boot:run

# 로그 확인
# "Tomcat started on port(s): 8080"
```

#### 5.2 Electron 시작
```bash
cd /home/ec2-user/projects/calender/electron
npm start
```

#### 5.3 로그인
```
1. 이미 로그인되어 있으면 유지
2. 아니면 Google OAuth 로그인
```

#### 5.4 WebSocket 연결 확인
```bash
# DevTools 콘솔에서
console.log(window.__syncEngine.wsConnected)

# 결과: true 또는 false
```

#### 5.5 검증
```
✅ 체크리스트:
□ WebSocket 연결됨 (true)
□ 콘솔 에러 없음
□ 백엔드 로그에 연결 표시
```

---

### 테스트 6: 메모 생성 (실시간) (30분)

**목표:** Electron에서 메모 생성 → WebSocket 수신 → UI 업데이트

#### 6.1 준비
```
1. Electron 앱 실행 중
2. DevTools 열기
3. 콘솔 정리 (Ctrl+L 또는 Cmd+K)
```

#### 6.2 메모 생성
```
1. [새 메모] 버튼 클릭
2. 제목: "WebSocket Test Note"
3. 내용: "Testing real-time sync"
4. [저장] 클릭
```

#### 6.3 로그 확인
```bash
# DevTools 콘솔에서 확인할 로그:
[Sync] Pushing notes...
[WebSocket] Message received: { action: 'note_created', ... }
[UI] Note added to list
```

#### 6.4 시각적 확인
```
✅ 체크리스트:
□ 메모 목록에 새 메모 표시
□ 시간 스탬프 정상
□ 콘솔 에러 없음
```

---

### 테스트 7: 다중 기기 동기화 (1시간)

**목표:** 2개 이상의 Electron 창에서 실시간 동기화

#### 7.1 준비
```bash
# 터미널 2개에서 각각:
npm start
npm start

# 또는 같은 계정으로 로그인한 다른 컴퓨터에서 앱 실행
```

#### 7.2 Device A에서 메모 생성
```
Device A (첫 번째 앱 창):
1. [새 메모] 클릭
2. 제목: "Multi-device Test"
3. [저장]
```

#### 7.3 Device B에서 확인
```
Device B (두 번째 앱 창):
1. 메모 목록 확인
2. 새 메모가 표시되는지 확인
3. 시간 기록
```

#### 7.4 속도 측정
```
Device A에서 메모 생성:     10:00:00.000
Device B에서 메모 수신:     10:00:00.450 (450ms)
```

#### 7.5 Device B에서 메모 수정
```
Device B:
1. 새 메모 클릭
2. 내용 수정
3. [저장]
```

#### 7.6 Device A에서 확인
```
Device A:
1. 메모 목록에서 수정 확인
2. 시간 확인
3. 지연 시간 기록
```

#### 7.7 검증
```
✅ 체크리스트:
□ Device B에서 생성 후 Device A에서 <500ms 내 수신
□ Device A에서 수정 후 Device B에서 <500ms 내 수신
□ 모든 기기에서 같은 내용 표시
□ 콘솔 에러 없음
```

---

### 테스트 8: 네트워크 끊김 및 재연결 (1시간)

#### 8.1 준비
```bash
# 시스템 설정에서 WiFi/Ethernet 끄기 준비
# 또는 브라우저 DevTools에서:
# [Network] 탭 → [Offline] 체크
```

#### 8.2 메모 작성 (온라인 상태)
```
1. [새 메모]
2. 제목: "Online Note"
3. [저장]
```

#### 8.3 네트워크 끄기
```
DevTools [Network] 탭에서 [Offline] 체크하거나
WiFi 끄기
```

#### 8.4 오프라인 메모 작성
```
1. [새 메모]
2. 제목: "Offline Note"
3. [저장]
4. "Pending..." 상태 표시 확인
```

#### 8.5 네트워크 복구
```
DevTools [Offline] 체크 해제 또는 WiFi 켜기
```

#### 8.6 동기화 확인
```
1. 앱 자동 재연결 시도
2. 재연결 성공 로그 확인
3. Pending 메모 자동 동기화
4. 상태 변경 확인
```

#### 8.7 검증
```
✅ 체크리스트:
□ 오프라인에서 메모 생성 가능
□ "Pending" 상태 표시
□ 네트워크 복구 시 자동 재연결
□ Pending 메모 자동 동기화
□ 콘솔 에러 없음
□ 앱 크래시 없음
```

---

## 📱 Phase 3-2 React Native 테스트 (2시간)

### 테스트 9: 로그인 및 기본 화면 (30분)

#### 9.1 시뮬레이터/에뮬레이터 시작
```bash
# iOS
cd /home/ec2-user/projects/calender/react-native
npm run ios

# Android
npm run android
```

#### 9.2 로그인
```
1. LoginScreen 표시 확인
2. Google OAuth 버튼 확인
3. 로그인 클릭
4. OAuth 인증 진행
```

#### 9.3 HomeScreen 검증
```
✅ 체크리스트:
□ 로그인 성공
□ HomeScreen 표시
□ 메모 목록 표시
□ 새 메모 버튼 표시
□ 검색 기능 작동
```

---

### 테스트 10: 메모 CRUD (30분)

#### 10.1 메모 생성
```
1. [새 메모] 버튼 클릭
2. 제목 입력: "Test Note"
3. 내용 입력: "Testing React Native"
4. [저장]
```

#### 10.2 메모 읽기
```
1. 목록에서 메모 클릭
2. 상세화면 표시
3. 제목/내용/시간 확인
```

#### 10.3 메모 수정
```
1. 메모 상세화면에서 [편집]
2. 내용 수정
3. [저장]
4. 목록으로 돌아가기
5. 수정 내용 확인
```

#### 10.4 메모 삭제
```
1. 목록에서 메모 길게 누르기 (또는 [삭제])
2. 확인 대화상자 표시
3. [삭제] 확인
4. 메모 목록에서 제거 확인
```

#### 10.5 검증
```
✅ 체크리스트:
□ 생성: 새 메모 목록에 추가
□ 읽기: 상세정보 표시
□ 수정: 변경사항 저장/표시
□ 삭제: 목록에서 제거
□ 콘솔 에러 없음
```

---

### 테스트 11: 캘린더 뷰 (30분)

#### 11.1 CalendarScreen 이동
```
1. 메뉴 → [Calendar] 또는 탭에서 선택
2. 캘린더 표시 확인
```

#### 11.2 월 네비게이션
```
1. < 버튼: 이전 달
2. > 버튼: 다음 달
3. 현재 달 표시 확인
```

#### 11.3 날짜별 메모 표시
```
1. 메모가 있는 날짜 확인
2. 메모 개수 표시 확인
3. 날짜 클릭: 해당 메모 목록 표시
```

#### 11.4 검증
```
✅ 체크리스트:
□ 캘린더 정상 렌더링
□ 월 네비게이션 작동
□ 메모 개수 표시
□ 날짜 클릭 → 메모 조회
□ 콘솔 에러 없음
```

---

### 테스트 12: 오프라인 모드 (30분)

#### 12.1 네트워크 끄기
```
iOS: Settings → Wi-Fi 끄기 + Cellular 끄기
Android: Settings → Network 끄기
또는 에뮬레이터 네트워크 설정
```

#### 12.2 오프라인 메모 생성
```
1. [새 메모]
2. 제목/내용 입력
3. [저장]
4. "Pending" 또는 "Syncing..." 표시 확인
```

#### 12.3 네트워크 복구
```
WiFi 또는 Cellular 켜기
```

#### 12.4 동기화 확인
```
1. 앱 자동 동기화 시도
2. Pending 상태 해제
3. 서버에서 데이터 확인
```

#### 12.5 검증
```
✅ 체크리스트:
□ 오프라인에서 메모 생성 가능
□ Pending 상태 표시
□ 네트워크 복구 시 자동 동기화
□ 앱 크래시 없음
□ 콘솔 에러 없음
```

---

## 🔄 통합 테스트 (2시간)

### 테스트 13: 다중 플랫폼 동기화

#### 13.1 준비
```
- 백엔드: 실행 중
- Electron: 실행 중 (Device A)
- React Native: 실행 중 (Device B)
```

#### 13.2 Electron에서 메모 생성
```
Device A (Electron):
1. [새 메모]
2. 제목: "Multi-Platform Test"
3. [저장]
```

#### 13.3 React Native에서 확인
```
Device B (React Native):
1. HomeScreen 메모 목록 확인
2. 새 메모 표시 여부 확인
3. 시간 기록
```

#### 13.4 React Native에서 메모 수정
```
Device B:
1. 메모 클릭
2. 내용 수정
3. [저장]
```

#### 13.5 Electron에서 확인
```
Device A:
1. 메모 목록 확인
2. 수정 내용 표시
3. 시간 기록
```

#### 13.6 검증
```
✅ 체크리스트:
□ Electron → React Native: <500ms
□ React Native → Electron: <500ms
□ 모든 기기에서 최신 내용 표시
□ 콘솔 에러 없음
```

---

## ⚡ 성능 테스트 (1시간)

### 테스트 14: 100개 메모 처리

#### 14.1 대량 메모 생성
```bash
# 백엔드에서 100개 메모 생성 스크립트 실행
# 또는 API 호출로 생성

for i in {1..100}; do
  curl -X POST http://localhost:8080/api/notes \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"Note $i\",\"content\":\"Content $i\"}"
done
```

#### 14.2 성능 측정 (Electron)
```bash
# DevTools → Performance 탭

1. 메모 목록 로드 시간 기록
2. 스크롤 프레임률 확인
3. 메모리 사용량 확인

목표:
- 로드 시간: <2초
- 프레임률: 60fps 유지
- 메모리: <200MB
```

#### 14.3 성능 측정 (React Native)
```
1. HomeScreen 로드 시간 기록
2. 스크롤 성능 확인
3. 메모리/배터리 사용 확인

목표:
- 로드 시간: <2초
- 스크롤 부드러움
- 배터리 소비 정상
```

#### 14.4 검증
```
✅ 체크리스트:
□ 로드 시간 <2초
□ 스크롤 60fps 유지
□ 메모리 <200MB (Electron), <150MB (React Native)
□ 크래시 없음
```

---

## 📋 최종 테스트 결과 보고서

### 템플릿
```markdown
# 테스트 결과 보고서

**테스트 일시:** YYYY-MM-DD HH:MM
**테스터:** [이름]
**환경:** 
- OS: [Windows/macOS/Linux]
- Electron: v30.x
- React Native: v0.72
- Node.js: v18.x

## 테스트 결과

| 테스트 | 결과 | 소요시간 | 비고 |
|--------|------|---------|------|
| Phase 2-4 | ✅/❌ | XXm | - |
| Phase 3-1 | ✅/❌ | XXm | - |
| Phase 3-2 | ✅/❌ | XXm | - |
| 통합 | ✅/❌ | XXm | - |
| 성능 | ✅/❌ | XXm | - |

## 발견된 이슈

### 심각 (Critical)
- [ ] 없음

### 높음 (High)
- [ ] 없음

### 중간 (Medium)
- [ ] 없음

### 낮음 (Low)
- [ ] 없음

## 종합 평가

총점: __/100

- 기능성: __/30
- 성능: __/20
- 안정성: __/20
- 보안: __/15
- UX: __/15

## 배포 승인

[ ] 승인 (배포 가능)
[ ] 조건부 승인 (이슈 수정 후 배포)
[ ] 거부 (배포 불가)

테스터 서명: ___________________
날짜: ____-____-____
```

---

## 💡 팁 및 주의사항

### 로그 확인 방법

#### Electron
```bash
# DevTools 열기: Ctrl+Shift+I
# → Console 탭
# → Errors 필터 클릭 → 에러만 표시
```

#### React Native
```bash
# iOS 시뮬레이터
# Menu → Debug → Open Debugger

# Android 에뮬레이터
# adb logcat | grep ReactNativeJS
```

### 스크린샷 및 비디오

```bash
# Electron 스크린샷
# Windows: Print Screen
# macOS: Cmd+Shift+3

# React Native 스크린샷
# iOS: 시뮬레이터 메뉴
# Android: 전원 + 볼륨 다운

# 비디오 녹화
# macOS: QuickTime Player
# Windows: Xbox Game Bar (Win+G)
```

### 문제 해결

#### 앱이 시작되지 않음
```bash
# 캐시 정리
npm cache clean --force

# node_modules 제거
rm -rf node_modules
npm install
```

#### WebSocket 연결 안 됨
```bash
# 백엔드 확인
curl -i http://localhost:8080

# 네트워크 확인
ping 127.0.0.1

# 포트 확인
lsof -i :8080
```

---

**테스트 완료 후 제공된 보고서 템플릿으로 결과 기록하세요!** 📝
