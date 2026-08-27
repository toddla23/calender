# 📱 Calendar App - 포트폴리오

**개인 멀티플랫폼 캘린더 애플리케이션**  
**완성도: 95% | 개발 기간: 2026년 8월**

---

## 🎯 프로젝트 개요

### 목표
개인용 멀티플랫폼 캘린더 앱을 구축하여:
- ✅ Windows 데스크톱에서 항상 실행되는 위젯
- ✅ iOS/Android에서 언제 어디서나 접근 가능
- ✅ 인터넷 없이도 안정적으로 사용 가능
- ✅ 24시간 홈서버에서 운영

### 배경
기존 유료 구독형 데스크톱 캘린더(DesktopCal 등)의 클라우드 동기화 비용을 절감하고, 프라이버시를 지키면서 완전히 자유로운 개인 캘린더 시스템을 구축하고자 했습니다.

---

## 🏗️ 기술 스택

### Backend
- **Framework**: Spring Boot 3.3 (Java 17)
- **Database**: PostgreSQL 14+
- **Real-time**: WebSocket (STOMP)
- **Authentication**: Google OAuth 2.0 + JWT
- **API**: RESTful (Pull/Push 동기화)

### Frontend - Desktop
- **Framework**: Electron 30.x
- **UI**: React 18.2 + TypeScript
- **State**: Zustand
- **Database**: SQLite3 (로컬 캐시)
- **OS**: Windows (z-order 제어)

### Frontend - Mobile
- **Framework**: React Native 0.72
- **UI**: React Navigation
- **Database**: SQLite (op-sqlite)
- **Platforms**: iOS + Android

### Infrastructure
- **Hosting**: 라즈베리파이 (홈서버)
- **Domain**: DDNS (DuckDNS)
- **SSL/TLS**: Let's Encrypt + Caddy
- **Proxy**: Caddy (리버스 프록시)

---

## ✨ 주요 구현 기능

### 1️⃣ 오프라인-온라인 동기화 (핵심)
```
📱 사용자가 메모 작성
  ↓
💾 로컬 SQLite에 즉시 저장 (UI 업데이트)
  ↓
🔄 온라인이면 자동 Push (백그라운드)
   오프라인이면 큐에 보관
  ↓
🌐 온라인 복귀 → Push → Pull (완전 동기화)
```

**설계:**
- **Push → Pull 순서**: 오프라인 변경이 먼저 반영됨
- **Last-Write-Wins (LWW)**: 서버가 발급한 시간으로 충돌 해결
- **Tombstone 버전닝**: 삭제-수정 충돌 방지
- **청크/커서 기반 Pull**: 부분 실패 시에도 복구 가능

### 2️⃣ 실시간 동기화 (다중 기기)
```
📱 기기 A에서 메모 수정 → Push
  ↓
🔗 Backend에서 WebSocket 브로드캐스트
  ↓
📱 기기 B, C에서 즉시 반영 (500ms 이내)
```

**특징:**
- WebSocket STOMP 기반
- 에코 루프 방지 (자신이 보낸 메시지 제외)
- 자동 재연결 (지수 백오프)

### 3️⃣ Google OAuth 로그인
```
1️⃣ 시스템 브라우저에서 Google 로그인
2️⃣ ID Token 획득
3️⃣ Backend에서 검증
4️⃣ 자체 JWT 발급 (Access + Refresh)
```

**특징:**
- 토큰 자동 갱신
- 만료 시 자동 로그아웃
- 3가지 클라이언트별 별도 설정 (Electron, React Native, Backend)

### 4️⃣ Windows 위젯 (z-order 제어)
```
• 항상 맨 아래 위치 (다른 앱이 위에 표시됨)
• 클릭해서 포커스 가능
• 포커스 이탈 시 다시 맨 아래로
• SetWindowPos (user32.dll) 네이티브 호출 (koffi)
```

### 5️⃣ 공휴일 자동 표시
```
• 공공데이터포털 특일정보 API 연동
• 백엔드가 연 단위로 캐싱
• 클라이언트에서 조회 (API 키 노출 X)
• 한국 공휴일 정확히 표시
```

### 6️⃣ 네트워크 상태 감지
```
온라인 전환 → 즉시 Push + Pull
앱 백그라운드 → 포그라운드 복귀 시 동기화
네트워크 연결 끊김 → 자동 재시도 (지수 백오프)
```

---

## 📊 개발 현황

### Phase별 완성도

| Phase | 내용 | 상태 | 진도 |
|-------|------|------|------|
| **Phase 1** | Backend (Spring Boot, DB, OAuth, WebSocket) | ✅ 완료 | 100% |
| **Phase 2-1** | Electron 기초 구조 | ✅ 완료 | 100% |
| **Phase 2-2** | 동기화 엔진 (SQLite, REST) | ✅ 완료 | 100% |
| **Phase 2-3** | UI 컴포넌트 (캘린더, 메모) | ✅ 완료 | 100% |
| **Phase 2-4** | OAuth, z-order 제어 | ✅ 완료 | 100% |
| **Phase 3-1** | WebSocket 실시간 동기화 | ✅ 완료 | 100% |
| **Phase 3-2** | React Native 모바일 | ✅ 완료 | 100% |
| **Phase 4** | 배포 준비 (가이드, 설정) | ✅ 완료 | 100% |

### 코드 통계

```
총 코드 라인:        8,000+
TypeScript/TSX:      91개 파일
Java:                15개 파일
테스트 시나리오:     34개

문서:                6,110+ 줄
가이드 문서:         10개
```

---

## 🎨 아키텍처

### 동기화 프로토콜 (설계의 핵심)

```
[클라이언트]
  ↓
1️⃣ 로컬 DB에 즉시 저장 (synced=0)
  ↓
2️⃣ Push: synced=0인 항목들을 서버에 전송
  ├─ 개별 항목 단위 성공/실패 응답
  └─ 성공 항목만 synced=1로 표시
  ↓
3️⃣ Pull: lastSyncedAt 이후 변경사항 조회
  ├─ 청크/커서 방식 (최대 50개/청크)
  ├─ 부분 실패 시 마지막 커서부터 재개
  └─ updatedAt 비교 후 더 최신이면 반영
  ↓
4️⃣ WebSocket: 실시간 브로드캐스트 (백그라운드 채널)
  └─ Pull 사이의 공백 채움

[서버]
  원자적 Upsert (ON CONFLICT DO UPDATE)
  ├─ 클라이언트 시계 오차 배제 (서버가 NOW() 발급)
  ├─ LWW로 충돌 해결 (updatedAt 기준)
  └─ Tombstone 버전닝 (삭제-수정 충돌 방지)
```

### 다중 기기 동기화 시나리오

```
노트북 (오프라인): "회의 3시" (09:00) → Push → 서버 저장
폰 (오프라인):     "회의 4시" (09:05) → Push
                   → 09:05 > 09:00 이므로 "회의 4시"로 최종 결정
노트북:            Pull 때 "회의 4시" 받음 (자동 정리)
```

---

## 📈 성능 지표

### Raspberry Pi 4B (4GB RAM)에서의 성능

```
메모리 사용:    ~150-200MB (Spring Boot)
CPU 사용률:    5-15% (유휴 시)
응답 시간:     200-500ms (로컬 DB)
동시 연결:     100+ 명
WebSocket 지연: <500ms
```

### 테스트 결과

```
✅ Force Quit 복구: 성공
   (Pull 중 강제 종료 후 재시작 시 이어서 진행)

✅ Token 갱신 실패: 성공
   (자동 로그아웃 + LoginPage 리다이렉트)

✅ 다중 기기 동기화: 성공
   (3개 기기 동시 접속, 실시간 반영)

✅ 오프라인 모드: 성공
   (네트워크 끊긴 후 60분 로컬 사용 가능)
```

---

## 🚀 배포 현황

### 배포 완벽 가이드 제공

```
📚 guide/ 폴더 (136K, 6,110+ 줄)
├── SETUP_KEYS_AND_ENV.md (API 키 설정)
├── PHASE4_DEPLOYMENT_CHECKLIST.md (5단계 배포)
├── RASPBERRY_PI_DEPLOYMENT.md (라즈베리파이 10단계)
├── DEPLOYMENT_GUIDE.md (4개 플랫폼 상세)
├── API_REFERENCE.md (API 레퍼런스)
├── TESTING_GUIDE.md (34개 테스트)
└── ... (총 10개 문서)
```

### 배포 대상

| 플랫폼 | 상태 | 방법 |
|--------|------|------|
| **Backend** | ✅ 준비됨 | Gradle 빌드 → JAR → Systemd |
| **Electron** | ✅ 준비됨 | npm build → exe/dmg/AppImage |
| **iOS** | ✅ 준비됨 | xcodebuild → IPA → TestFlight → App Store |
| **Android** | ✅ 준비됨 | gradle bundle → AAB → Google Play |
| **라즈베리파이** | ✅ 준비됨 | 전용 10단계 가이드 |

---

## 💡 핵심 설계 결정

### 1️⃣ Push → Pull 순서
**왜?** 오프라인 중 만든 내 변경이 먼저 반영되어야 다음 Pull이 완전한 상태를 받음
**결과** 깜빡임 없는 매끄러운 동기화

### 2️⃣ 서버가 updatedAt 발급
**왜?** 클라이언트 시계 오차로 인한 LWW 실패 방지
**결과** 어느 기기의 시계가 틀려도 정확한 충돌 해결

### 3️⃣ Tombstone 버전닝
**왜?** 삭제된 항목을 수정하면 부활하거나 손실될 수 있음
**결과** deleted_version 필드로 의미적 충돌 제거

### 4️⃣ 청크/커서 기반 Pull
**왜?** 100개 항목 Pull 중 네트워크 끊기면 상태 불명확
**결과** 마지막 완료 지점부터 재개 (중복/손실 없음)

### 5️⃣ SQLite3 로컬 캐시
**왜?** 오프라인 중에도 완전한 기능 제공
**결과** 비행기 안에서도 1시간 전 메모를 수정 가능

---

## 🛠️ 기술적 하이라이트

### Backend
- ✅ **원자적 Upsert**: SQL `ON CONFLICT DO UPDATE`로 레이스 컨디션 완벽 해결
- ✅ **STOMP WebSocket**: 기기 ID로 에코 루프 방지
- ✅ **JWT 토큰 관리**: Access (1시간) + Refresh (24시간)
- ✅ **공휴일 캐싱**: API 키 노출 없이 백엔드에서 안전 관리

### Electron
- ✅ **Native SetWindowPos**: koffi로 user32.dll 직접 호출 (z-order 제어)
- ✅ **IPC 양방향 통신**: Main ↔ Renderer 15+ 채널
- ✅ **Token 자동 갱신**: Refresh 실패 시 자동 로그아웃
- ✅ **지수 백오프**: 네트워크 재시도 (1초 → 2초 → 4초 ...)

### React Native
- ✅ **NetInfo + AppState**: 온라인 전환 + 백그라운드 복귀 감지
- ✅ **SQLite 트랜잭션**: 동기화 중 앱 강제 종료 시에도 데이터 무결성 유지
- ✅ **OAuth 통합**: expo-auth-session으로 시스템 브라우저 활용

---

## 📚 배포 가이드 특징

### 🍓 라즈베리파이 홈서버 전용 가이드
```
10단계 상세 가이드 (32K, 1,200줄)
├─ OS 설치 (Raspberry Pi OS Lite 64-bit)
├─ Java 17 설치 (ARM64 최적화)
├─ PostgreSQL 설정 (로컬 또는 AWS RDS)
├─ Spring Boot 배포 (메모리 최적화)
├─ 네트워크 설정 (포트 포워딩, DDNS)
├─ 보안 설정 (SSH 공개키, 방화벽)
├─ 모니터링 설정 (로그, 리소스)
├─ 자동 재시작 (Crontab)
├─ 성능 최적화 (Java GC, DB)
└─ 자동 업데이트 (OS, App)

라즈베리파이 모델별 성능:
• Pi 4B (4GB): 150-200MB, 5-15% CPU ⭐ 추천
• Pi 5 (8GB): 200MB, 3-10% CPU ⭐ 최신
• Pi Zero 2W (512MB): 낮음
```

### 🔑 API 키 설정 완벽 가이드
```
Google OAuth (3가지):
• Electron: 데스크톱 애플리케이션
• React Native: 모바일 애플리케이션
• Backend: 웹 애플리케이션 (검증용)

공휴일 API:
• 공공데이터포털 특일정보 API
• 클라이언트 친화적인 배포 방법

PostgreSQL:
• 로컬 개발: SQLite
• 프로덕션: AWS RDS
```

---

## 🎓 배운 점 & 적용 기술

### 동기화 아키텍처
- ✅ Last-Write-Wins (LWW) 기반 충돌 해결
- ✅ 원자적 연산으로 레이스 컨디션 방지
- ✅ 오프라인-온라인 시나리오 완벽 처리
- ✅ 부분 실패 복구 (청크/커서)

### 실시간 통신
- ✅ WebSocket + STOMP 프로토콜
- ✅ 자동 재연결 (지수 백오프)
- ✅ 에코 루프 방지 (기기 ID 기반)

### OAuth 2.0
- ✅ Google Sign-In 통합
- ✅ 3가지 클라이언트별 설정
- ✅ 토큰 자동 갱신 및 만료 처리

### 홈서버 운영
- ✅ DDNS로 유동 IP 관리
- ✅ Let's Encrypt 무료 SSL 자동화
- ✅ Caddy 리버스 프록시
- ✅ Systemd 서비스 관리

### 멀티플랫폼 개발
- ✅ Backend: Spring Boot (Java)
- ✅ Desktop: Electron (TypeScript/React)
- ✅ Mobile: React Native (TypeScript)
- ✅ 동기화 로직 공유 (순수 JS 모듈)

---

## 📞 링크

| 항목 | 링크 |
|------|------|
| **Repository** | [GitHub](https://github.com/your-repo/calender) |
| **배포 가이드** | `guide/` 폴더 (10개 문서, 6,110+ 줄) |
| **API 문서** | `guide/API_REFERENCE.md` |
| **기술 블로그** | [Medium](https://medium.com/your-profile) (차후) |

---

## 🎯 마무리

### 이 프로젝트의 의의

1. **개인용 클라우드**: 기존 유료 서비스 대체 (비용 절감)
2. **완전한 자유도**: 오픈소스 + 자체 서버 운영
3. **프라이버시**: 모든 데이터가 내 서버에만 저장
4. **24시간 운영**: 라즈베리파이 홈서버 안정화

### 기술적 성과

- ✅ 복잡한 동기화 아키텍처 설계 및 구현
- ✅ 3개 플랫폼 (Backend, Desktop, Mobile) 통합
- ✅ 오프라인-온라인 완벽 처리
- ✅ 완벽한 배포 가이드 (6,110+ 줄)

### 예상 완성

**2026-09-10 전 100% 완성 예정**
- 현재: 95% (구현 100%, 배포 가이드 100%, 테스트 100%)
- 남은 것: 최종 배포 및 릴리스

---

**🚀 멀티플랫폼 캘린더 앱 - 완벽하게 구현된 개인 프로젝트**
