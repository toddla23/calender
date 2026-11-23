# 07. 빌드와 배포

## 1. 받기

- 윈도우: [BatangCalendar-setup.exe (최신 버전)](https://github.com/toddla23/calender/releases/latest/download/BatangCalendar-setup.exe)
- Android: [BatangCalendar.apk (최신 버전)](https://github.com/toddla23/calender/releases/latest/download/BatangCalendar.apk)
- [모든 릴리스](https://github.com/toddla23/calender/releases)

설치할 때:
- 윈도우: 코드 서명이 없어서(O-03) 처음 실행할 때 SmartScreen 경고가 뜰 수 있다. **추가 정보 → 실행**. 현재 사용자용으로 설치되며 관리자 권한은 필요 없다.
- Android: 처음 한 번은 "출처를 알 수 없는 앱 설치"를 허용해야 한다. Android 7.0 이상, Chrome 필요.

## 2. 개발과 테스트

```bash
npm ci
# 테스트용 MariaDB (포트 3307)
docker run -d --name deskcal-testdb -p 127.0.0.1:3307:3306 \
  -e MARIADB_ROOT_PASSWORD=rootpw-test -e MARIADB_DATABASE=deskcal_test \
  -e MARIADB_USER=deskcal -e MARIADB_PASSWORD=testpw mariadb:11.8
npm test                 # 서버(인증·동기화·충돌) + 웹(동기화 엔진·시나리오) 테스트
npm run dev:server       # .env 필요
npm run dev:web          # http://localhost:5173 (API 는 3000 으로 프록시)
```

CI `test.yml`(**테스트**)는 MariaDB 컨테이너로 서버·동기화 테스트를 돌리고 arm64 이미지 빌드까지 확인한다.

## 3. 릴리스 절차

버전 태그를 푸시하면 Actions가 윈도우 설치 파일과 Android APK·AAB를 빌드해 **Releases**에 붙인다.

```bash
git tag v0.1.1 && git push origin v0.1.1
```

- 윈도우 앱 안에 표시되는 버전은 `desktop/src-tauri/tauri.conf.json`의 `version`이다. 태그와 맞춰 올린다.
- Android `versionCode`는 태그에서 계산한다(`v1.2.3` → `10203`).
- Android 앱(TWA)은 서버의 웹 코드를 그대로 쓰므로 서버만 업데이트하면 된다. 윈도우 앱은 `web/`을 설치 파일에 넣으므로 화면 코드가 바뀌면 새로 릴리스한다. 예전 윈도우 앱도 새 서버에 붙지만, 계정 전환 보호(03-protocol 3.1)·사용량·계정 삭제는 새 앱부터 된다.

## 4. 윈도우 앱

### 4.1 직접 빌드

준비물(한 번만):
- [Node.js 22 이상](https://nodejs.org/)
- [Rust](https://rustup.rs/) (설치 시 기본값 `x86_64-pc-windows-msvc`)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 에서 **C++를 사용한 데스크톱 개발** 워크로드
- WebView2 런타임 (Windows 11 에는 기본 설치)

```powershell
git clone <이 저장소> deskcal; cd deskcal
npm ci
npm run build:desktop
```

결과물: `desktop\src-tauri\target\release\bundle\nsis\BatangCalendar_0.1.0_x64-setup.exe`

### 4.2 GitHub Actions

`windows-build.yml`. 태그 없이 빌드만 하려면 **Actions → "Windows 설치 파일 빌드" → Run workflow**. 결과물은 실행 결과의 Artifacts에 올라간다.

## 5. Android 앱

### 5.1 서명 키 (중요)

업로드 키는 `C:\Users\jonghyeok\.deskcal-android\upload.jks`에 있고, 비밀번호는 같은 폴더의 `keystore-password.txt`에 있다.

- 이 키를 잃어버리면 이미 설치된 앱을 업데이트할 수 없다. 이 폴더를 USB나 비밀번호 관리자 등 **안전한 곳에 따로 백업**한다.
- 저장소에는 절대 넣지 않는다.

### 5.2 GitHub Secrets

`android-build.yml`(**Android 앱 빌드**)이 태그마다 APK/AAB를 빌드하려면 저장소 **Settings → Secrets and variables → Actions → New repository secret**에 두 개를 등록한다.

| 이름 | 값 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `.deskcal-android\keystore-base64.txt` 의 내용 전체 |
| `ANDROID_KEYSTORE_PASSWORD` | `.deskcal-android\keystore-password.txt` 의 내용 |

### 5.3 직접 빌드

Android Studio 의 SDK 와 JDK 21 필요.

```powershell
cd android
$env:ANDROID_KEYSTORE_PATH = "$HOME\.deskcal-android\upload.jks"
$env:ANDROID_KEYSTORE_PASSWORD = Get-Content "$HOME\.deskcal-android\keystore-password.txt"
.\gradlew assembleRelease bundleRelease
# → app\build\outputs\apk\release\app-release.apk, app\build\outputs\bundle\release\app-release.aab
```

### 5.4 플레이스토어 (F15)

1. 릴리스의 `BatangCalendar.aab`를 Play Console에 업로드한다.
2. "Play 앱 서명"을 쓰게 되므로 Play Console → 앱 무결성에 나오는 **앱 서명 키 SHA-256 지문**을 파이 `.env`의 `ANDROID_CERT_SHA256=`에 넣고(쉼표 구분) `docker compose up -d` 한다. 그래야 스토어에서 받은 앱도 주소창 없이 열린다.
3. 패키지 이름 `io.github.toddla23.batangcalendar`는 한 번 올리면 바꿀 수 없다 (D-008).
