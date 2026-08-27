# ⚡ 빠른 시작 가이드 (Quick Start)

**대상:** 신규 개발자, 테스터  
**소요 시간:** 10-15분

---

## 🎯 5분 안에 시작하기

### 1단계: 저장소 클론
```bash
git clone https://github.com/your-org/calender.git
cd calender
```

### 2단계: 백엔드 시작
```bash
cd backend
./mvnw spring-boot:run
# 대기: "Tomcat started on port(s): 8080"
```

### 3단계: Electron 시작 (새 터미널)
```bash
cd electron
npm install
npm start
```

### 4단계: 로그인
```
1. Google 계정으로 로그인
2. 메모 작성 확인
```

**완료!** 🎉

---

## 📝 개발 환경 설정

### 필수 설치
- Node.js 18+
- Java 17+
- PostgreSQL 14+
- Git

### 확인
```bash
node --version
# v18.x.x

java -version
# java 17.x.x

psql --version
# PostgreSQL 14.x
```

---

## 🗂️ 프로젝트 구조

```
calender/
├── backend/                 # Spring Boot API
│   └── mvnw                # Maven 실행
├── electron/               # Desktop 앱
│   ├── src/main/          # Main process
│   ├── src/renderer/      # React UI
│   └── package.json
├── react-native/           # Mobile 앱
│   ├── ios/               # iOS
│   ├── android/           # Android
│   └── package.json
├── guide/                  # 이 파일들
└── project-status/         # 프로젝트 상태 문서
```

---

## 📖 주요 명령어

### 백엔드
```bash
# 빌드
./mvnw clean package

# 테스트
./mvnw test

# 실행
./mvnw spring-boot:run

# 프로덕션 빌드
./mvnw package -DskipTests -Pprod
```

### Electron
```bash
# 설치
npm install

# 실행
npm start

# 빌드
npm run build

# 배포
npm run dist

# 타입 검사
npm run tsc

# 테스트
npm test
```

### React Native
```bash
# 설치
npm install

# iOS 실행
npm run ios

# Android 실행
npm run android

# 빌드
npm run build

# 테스트
npm test
```

---

## 🐛 문제 해결

### "포트 8080이 이미 사용 중"
```bash
# 프로세스 확인
lsof -i :8080

# 프로세스 종료
kill -9 <PID>

# 또는 다른 포트 사용
export SERVER_PORT=8081
```

### "npm install 느림"
```bash
# 캐시 정리
npm cache clean --force

# 글로벌 캐시 정리
rm -rf ~/.npm
```

### "git 인증 오류"
```bash
# SSH 키 생성
ssh-keygen -t rsa -b 4096

# 퍼블릭 키를 GitHub에 추가
cat ~/.ssh/id_rsa.pub

# SSH 테스트
ssh -T git@github.com
```

---

## 📚 다음 단계

1. **문서 읽기**
   - `project-status/00_PROJECT_OVERVIEW.md` — 프로젝트 개요
   - `project-status/01_CURRENT_STATUS.md` — 현재 상태

2. **테스트**
   - `guide/TESTING_GUIDE.md` — 상세 테스트 가이드

3. **배포**
   - `guide/DEPLOYMENT_GUIDE.md` — 배포 절차

4. **개발**
   - 코드 탐색
   - Pull Request 생성
   - 코드 리뷰 진행

---

## 💬 도움말

### 로그 보기
```bash
# Electron 콘솔
Ctrl+Shift+I (DevTools 열기)

# 백엔드 로그
tail -f /opt/calender/logs/app.log
```

### 디버깅
```bash
# Node.js 디버그
node --inspect ./src/index.js

# Chrome DevTools에서
chrome://inspect
```

---

## ✅ 성공 확인

- [ ] 백엔드: http://localhost:8080/api/health → {"status":"UP"}
- [ ] Electron: 앱 창이 열림
- [ ] React Native: 시뮬레이터 실행
- [ ] 로그인 가능
- [ ] 메모 생성 가능

---

**모든 단계 완료되면 개발 시작! 🚀**
