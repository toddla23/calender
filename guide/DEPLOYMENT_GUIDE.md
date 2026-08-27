# 🚀 배포 가이드 (배포 실행 매뉴얼)

**대상:** DevOps, 배포 담당자  
**마지막 업데이트:** 2026-08-27  
**예상 배포 시간:** 4-6시간

---

## 📋 배포 전 체크리스트

### 코드 준비
- [ ] 모든 테스트 통과
- [ ] 코드 리뷰 완료
- [ ] 버전 번호 업데이트 (package.json, build.gradle)
- [ ] CHANGELOG.md 작성
- [ ] Git tag 생성 (`v1.0.0`)

### 보안 확인
- [ ] 민감한 정보 제거 (API 키, 비밀번호)
- [ ] 환경 변수 설정 완료
- [ ] SSL 인증서 준비
- [ ] 보안 감사 완료

### 인프라 준비
- [ ] 서버 상태 확인
- [ ] 데이터베이스 백업
- [ ] 로드 밸런서 설정
- [ ] 모니터링 도구 준비

---

## 🖥️ 1단계: 백엔드 배포 (Spring Boot)

### 1.1 프로덕션 빌드

#### 사전 요구사항
```bash
# 1. Java 17+ 설치 확인
java -version

# 2. Maven 설치 확인
mvn -version

# 3. 데이터베이스 정보 확인
# application-prod.properties에 DB 연결 정보 설정
```

#### 빌드 실행
```bash
cd /home/ec2-user/projects/calender/backend

# 1. 의존성 업데이트
./mvnw clean update-dependencies

# 2. 프로덕션 빌드
./mvnw clean package -DskipTests -Pprod

# 생성 파일 위치
# target/calender-1.0.0.jar
```

### 1.2 배포 전 검증

```bash
# 1. JAR 파일 크기 확인 (일반적으로 50-100MB)
ls -lh target/calender-1.0.0.jar

# 2. 클래스 파일 확인
jar tf target/calender-1.0.0.jar | wc -l
# 출력: 2000+ 파일

# 3. 매니페스트 확인
unzip -p target/calender-1.0.0.jar META-INF/MANIFEST.MF
```

### 1.3 로컬에서 실행 테스트

```bash
# 환경 변수 설정
export SPRING_PROFILES_ACTIVE=prod
export SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/calender
export SPRING_DATASOURCE_USERNAME=postgres
export SPRING_DATASOURCE_PASSWORD=your_password

# JAR 실행
java -jar target/calender-1.0.0.jar

# 로그 확인
# "Tomcat started on port(s): 8080"
# "WebSocket support enabled"

# API 테스트
curl -X GET http://localhost:8080/api/health
# 응답: { status: "UP" }
```

### 1.4 프로덕션 서버에 배포

#### SSH로 접속
```bash
ssh -i /path/to/key.pem ubuntu@production-server.com
```

#### 배포 디렉토리 준비
```bash
sudo mkdir -p /opt/calender/app
sudo mkdir -p /opt/calender/logs
sudo chown ubuntu:ubuntu /opt/calender
```

#### JAR 파일 업로드
```bash
# 로컬에서 실행
scp -i /path/to/key.pem \
  target/calender-1.0.0.jar \
  ubuntu@production-server.com:/opt/calender/app/
```

#### 환경 설정
```bash
# 프로덕션 서버에서 실행
cd /opt/calender/app

# .env 파일 생성
cat > .env << EOF
SPRING_PROFILES_ACTIVE=prod
SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/calender
SPRING_DATASOURCE_USERNAME=prod_user
SPRING_DATASOURCE_PASSWORD=$(openssl rand -base64 32)
SPRING_JPA_PROPERTIES_HIBERNATE_DIALECT=org.hibernate.dialect.PostgreSQL10Dialect
LOGGING_LEVEL_ROOT=INFO
SERVER_PORT=8080
EOF

chmod 600 .env
```

#### Systemd 서비스 등록
```bash
# systemd 서비스 파일 생성
sudo cat > /etc/systemd/system/calender.service << EOF
[Unit]
Description=Calendar App Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/calender/app
EnvironmentFile=/opt/calender/app/.env
ExecStart=/usr/bin/java -jar calender-1.0.0.jar
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/calender/logs/app.log
StandardError=append:/opt/calender/logs/error.log

[Install]
WantedBy=multi-user.target
EOF

# 서비스 시작
sudo systemctl daemon-reload
sudo systemctl enable calender
sudo systemctl start calender

# 상태 확인
sudo systemctl status calender
```

#### 로그 확인
```bash
tail -f /opt/calender/logs/app.log

# 예상 로그:
# Started CalenderApplication in X seconds
# Tomcat started on port(s): 8080
```

### 1.5 배포 검증

```bash
# 1. 포트 확인
ss -tulpn | grep 8080

# 2. 프로세스 확인
ps aux | grep calender

# 3. API 테스트
curl -X GET http://localhost:8080/api/health

# 4. 데이터베이스 연결 확인
curl -X GET http://localhost:8080/api/notes \
  -H "Authorization: Bearer test_token"
```

---

## 🖥️ 2단계: Electron 데스크톱 배포

### 2.1 프로덕션 빌드

```bash
cd /home/ec2-user/projects/calender/electron

# 1. 환경 변수 설정
export NODE_ENV=production
export API_URL=https://api.production.com
export WS_URL=wss://api.production.com/ws

# 2. 빌드
npm run build

# 생성 파일
# dist/calender-1.0.0-win.exe (Windows)
# dist/calender-1.0.0.dmg (macOS)
# dist/calender-1.0.0.AppImage (Linux)
```

### 2.2 파일 크기 확인

```bash
ls -lh dist/

# Windows: ~150MB
# macOS: ~180MB
# Linux: ~140MB
```

### 2.3 서명 (선택사항이지만 권장)

#### Windows 코드 서명
```bash
# 1. 인증서 준비 (PFX 파일)
# c:\path\to\certificate.pfx

# 2. 서명
signtool sign /f certificate.pfx /p password /t http://timestamp.server \
  dist/calender-1.0.0-win.exe

# 3. 검증
signtool verify /pa dist/calender-1.0.0-win.exe
```

#### macOS 코드 서명
```bash
# 1. 인증서 확인
security find-identity -v -p codesigning

# 2. 서명
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Company (TEAM_ID)" \
  dist/calender-1.0.0.dmg

# 3. 검증
spctl -a -v dist/calender-1.0.0.dmg
```

### 2.4 배포 저장소 업로드

```bash
# GitHub Releases에 업로드
gh release create v1.0.0 \
  dist/calender-1.0.0-win.exe \
  dist/calender-1.0.0.dmg \
  dist/calender-1.0.0.AppImage \
  -t "Release v1.0.0" \
  -n "Production release"

# 또는 S3에 업로드
aws s3 cp dist/ s3://calender-releases/ --recursive
```

### 2.5 자동 업데이트 설정

```bash
# electron-updater 설정 확인
# electron/electron-builder.json

cat > electron/electron-builder.json << EOF
{
  "publish": {
    "provider": "github",
    "owner": "your-org",
    "repo": "calender",
    "releaseName": "v${version}"
  },
  "appId": "com.calender.app",
  "productName": "Calendar App"
}
EOF
```

---

## 📱 3단계: React Native iOS 배포

### 3.1 빌드 준비

```bash
cd /home/ec2-user/projects/calender/react-native

# 1. Pod 업데이트
cd ios && pod install && cd ..

# 2. 번들 생성
npm run bundle:ios
```

### 3.2 Xcode 빌드

```bash
# 빌드 설정
xcodebuild \
  -workspace ios/Calender.xcworkspace \
  -scheme Calender \
  -configuration Release \
  -derivedDataPath build \
  -archivePath build/Calender.xcarchive \
  archive

# IPA 추출
xcodebuild \
  -exportArchive \
  -archivePath build/Calender.xcarchive \
  -exportPath build/Release \
  -exportOptionsPlist ExportOptions.plist
```

### 3.3 TestFlight 업로드

```bash
# App Store Connect 인증
xcrun altool --validate-app \
  -f build/Release/Calender.ipa \
  -t iOS \
  -u apple-id@example.com \
  -p app-specific-password

# 업로드
xcrun altool --upload-app \
  -f build/Release/Calender.ipa \
  -t iOS \
  -u apple-id@example.com \
  -p app-specific-password

# 결과 확인
# App Store Connect 웹사이트에서 확인
```

### 3.4 TestFlight 테스트

1. App Store Connect 접속
2. "TestFlight" 탭
3. 내부 테스트자 추가
4. 테스트자 20명 초대
5. 1-2주 테스트

### 3.5 App Store 배포

1. "Availability & Pricing" 설정
2. "General App Information" 작성
3. "App Review" 제출
4. Apple 검토 (1-3일)
5. "Release" 클릭으로 배포

---

## 📱 4단계: React Native Android 배포

### 4.1 빌드 준비

```bash
cd /home/ec2-user/projects/calender/react-native

# 1. 키스토어 생성 (첫 배포 시)
cd android
keytool -genkey -v -keystore release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias calender_release

# 2. 비밀번호 설정
# gradle.properties에 추가:
cat >> gradle.properties << EOF
MYAPP_RELEASE_STORE_FILE=release.keystore
MYAPP_RELEASE_STORE_PASSWORD=your_password
MYAPP_RELEASE_KEY_ALIAS=calender_release
MYAPP_RELEASE_KEY_PASSWORD=your_password
EOF

cd ..
```

### 4.2 AAB 빌드 (권장)

```bash
cd react-native

# Android App Bundle 생성
npm run android:bundle

# 생성 파일
# android/app/build/outputs/bundle/release/app-release.aab
```

### 4.3 APK 빌드 (대체)

```bash
cd react-native

# Release APK 생성
npm run android:apk

# 생성 파일
# android/app/build/outputs/apk/release/app-release.apk
```

### 4.4 Google Play 배포

#### 4.4.1 첫 배포 설정

1. Google Play Console 접속
2. 새 앱 생성
3. 앱 정보 입력 (이름, 설명, 스크린샷)
4. 콘텐츠 등급 설정
5. 가격 설정 (무료)

#### 4.4.2 테스트 버전 업로드 (알파)

```bash
# aab 업로드
# Google Play Console → 버전 → 내부 테스팅

# 테스트 유저 추가
# 이메일 주소 추가

# 테스트 링크 공유
# 테스터가 클릭하여 앱 설치
```

#### 4.4.3 필드 테스팅 업로드

```bash
# 같은 aab를 필드 테스팅 트랙에 업로드
# 테스터 100-1000명 추가
# 1주 테스트
```

#### 4.4.4 프로덕션 배포

```bash
# 같은 aab를 프로덕션 트랙에 업로드
# 점진적 롤아웃 설정:
# 1단계: 5%
# 1주 모니터링
# 2단계: 25%
# 1주 모니터링
# 3단계: 50%
# 1주 모니터링
# 4단계: 100% (전체 배포)
```

### 4.5 배포 검증

```bash
# 1. Google Play에서 검색 가능 확인
# Google Play 앱 검색: "Calendar App"

# 2. 설치 가능 확인
# 안드로이드 기기에서 설치

# 3. 기능 테스트
# 로그인, 메모 생성/수정/삭제

# 4. 권한 확인
# 카메라, 저장소 권한 정상 요청
```

---

## 🔍 배포 후 모니터링

### 1. 헬스 체크

```bash
# 백엔드 상태
curl -X GET https://api.production.com/api/health

# WebSocket 테스트
# 앱을 열어서 연결 확인

# 데이터베이스
# DB 쿼리 성공 확인
```

### 2. 로그 모니터링

```bash
# 백엔드 로그
tail -f /opt/calender/logs/app.log

# 에러 필터
grep ERROR /opt/calender/logs/app.log

# 경고 필터
grep WARN /opt/calender/logs/app.log
```

### 3. 성능 모니터링

```bash
# CPU 사용률
top -b -n 1 | grep calender

# 메모리 사용량
ps aux | grep calender | awk '{print $6}'

# 디스크 사용량
df -h /opt/calender
```

### 4. 사용자 피드백 수집

- [ ] App Store 리뷰 모니터링
- [ ] Google Play 리뷰 모니터링
- [ ] 사용자 이메일 응답
- [ ] 에러 보고 수집

---

## 🚨 롤백 절차

### 백엔드 롤백

```bash
# 1. 이전 JAR 파일 준비
# /opt/calender/app/calender-0.9.9.jar

# 2. 서비스 중지
sudo systemctl stop calender

# 3. JAR 파일 교체
cd /opt/calender/app
mv calender-1.0.0.jar calender-1.0.0.jar.bak
ln -s calender-0.9.9.jar calender-1.0.0.jar

# 4. 데이터베이스 롤백 (필요시)
psql -U postgres calender < /backups/calender-0.9.9.sql

# 5. 서비스 재시작
sudo systemctl start calender

# 6. 검증
sudo systemctl status calender
curl http://localhost:8080/api/health
```

### Desktop/Mobile 롤백

```bash
# 1. 이전 버전 배포
# GitHub Releases에서 다운로드
# App Store/Google Play에서 선택

# 2. 자동 업데이트 비활성화
# 환경 설정에서 수동 업데이트로 변경
```

---

## 📊 배포 체크리스트

### 사전 배포
- [ ] 모든 테스트 통과
- [ ] 코드 리뷰 완료
- [ ] 보안 감사 완료
- [ ] 버전 번호 업데이트
- [ ] CHANGELOG 작성
- [ ] Git 태그 생성
- [ ] 환경 변수 확인
- [ ] 데이터베이스 백업
- [ ] 모니터링 준비

### 배포 중
- [ ] 백엔드 배포 및 검증
- [ ] Electron 배포 및 서명
- [ ] iOS TestFlight 배포
- [ ] Android 알파 배포
- [ ] 데이터 마이그레이션 (필요시)
- [ ] DNS 업데이트 (필요시)

### 배포 후
- [ ] 헬스 체크
- [ ] 로그 모니터링
- [ ] 성능 모니터링
- [ ] 사용자 피드백 수집
- [ ] 문제점 기록
- [ ] 버전 1.1 계획

---

## 🔄 배포 타임라인

```
배포 준비:     1-2시간
백엔드 배포:   30분
Electron 배포: 30분
iOS 배포:      5-10분 (검토 1-3일)
Android 배포:  5-10분 (검토 즉시)
검증:          30분
총 예상:       4-6시간 + 검토 시간
```

---

**배포 완료 후 모든 체크리스트를 표시하고 문제 사항을 기록하세요!** ✅
