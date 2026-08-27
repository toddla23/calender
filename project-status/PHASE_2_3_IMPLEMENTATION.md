# Phase 2-3 구현 완료 (UI + Google OAuth)

**완료 일자:** 2026-08-27  
**상태:** ✅ 구현 완료 (기본 기능)

---

## 📋 구현된 기능

### 1. UI 컴포넌트

#### Calendar 컴포넌트 (`Calendar.tsx`)
- 월간 캘린더 뷰 (date-fns 사용)
- 이전/다음 월 네비게이션
- 오늘 하이라이트
- 선택된 날짜 강조
- 메모 있는 날짜 표시 (점 아이콘)
- 반응형 디자인

**위치:** `electron/src/renderer/components/Calendar.tsx`

#### NotesList 컴포넌트
- 선택된 날짜의 메모 목록
- 메모 색상 표시
- 미동기 항목 배지
- 메모 클릭 시 편집 모드

**위치:** `electron/src/renderer/components/NotesList.tsx`

#### NoteModal 컴포넌트 (`NoteModal.tsx`)
- 메모 작성/수정 모달
- 5가지 색상 선택
- 메모 삭제 기능
- 저장/취소 버튼
- 로딩 상태 표시

**위치:** `electron/src/renderer/components/NoteModal.tsx`

#### SyncStatus 컴포넌트
- 네트워크 상태 표시 (온라인/오프라인)
- 동기화 진행 상황 (Push/Pull)
- 미동기 항목 개수
- 에러 메시지 자동 숨김 (5초)
- 애니메이션 스피너

**위치:** `electron/src/renderer/components/SyncStatus.tsx`

### 2. 상태 관리 (Zustand)

#### NotesStore (`store/notes.ts`)
- 날짜별 메모 맵 관리
- 선택된 날짜 추적
- CRUD 작업 (추가/수정/삭제)
- IPC 호출 및 로컬 상태 동기화

#### SyncStore (`store/sync.ts`)
- 동기화 상태 관리
- 네트워크 상태
- 동기화 단계 추적

#### AuthStore (`store/auth.ts`)
- 인증 토큰 관리
- localStorage 자동 저장/복구
- 로그인/로그아웃

**위치:** `electron/src/renderer/store/`

### 3. 페이지

#### LoginPage (`pages/LoginPage.tsx`)
- 구글 로그인 버튼
- 주요 기능 소개
- 에러 메시지 표시
- 응답형 디자인

**위치:** `electron/src/renderer/pages/LoginPage.tsx`

### 4. 스타일 시스템

- CSS Modules 활용
- 일관된 색상 팔레트
- 부드러운 트랜지션
- 반응형 레이아웃
- 커스텀 스크롤바

**파일:**
- `Calendar.module.css` (캘린더)
- `NoteModal.module.css` (모달)
- `NotesList.module.css` (목록)
- `SyncStatus.module.css` (상태바)
- `App.module.css` (레이아웃)
- `LoginPage.module.css` (로그인)
- `index.css` (글로벌)

### 5. 렌더러 진입점

#### index.tsx
- React 루트 마운트
- StrictMode 활성화

#### preload.ts
- IPC 브릿지 (contextBridge)
- 안전한 메인 프로세스 통신
- 메서드: invoke, on, once, off

**위치:** `electron/src/renderer/index.tsx`

### 6. 백엔드 헬스 체크

#### HealthController.java
- `/api/health` GET 엔드포인트
- 200 OK 응답
- 네트워크 모니터 용

**위치:** `backend/src/main/java/com/calendar/controller/HealthController.java`

### 7. 윈도우 크기 조정

- 너비: 400px → 1000px
- 높이: 600px → 700px
- 월간 캘린더 + 메모 목록 표시 가능

---

## 🎨 UI 디자인 개요

```
┌─────────────────────────────────────────────┐
│        SyncStatus (진행 상태)                 │
├─────────────────┬───────────────────────────┤
│                 │                           │
│   Calendar      │   Date: 2026-08-27       │
│   (월간 뷰)     │   [+ 새 메모]            │
│                 │                           │
│   ← 2026-08 →   │   NotesList              │
│                 │   ┌──────────────────┐   │
│   S  M  T  W    │   │ 📝 메모 1 (노란색)│   │
│   ┌─────────┐   │   │ 미동기 배지        │   │
│   │ 1  2  3 │   │   └──────────────────┘   │
│   │ ...[점] │   │   ┌──────────────────┐   │
│   │ 30 31   │   │   │ 📝 메모 2 (파란색)│   │
│   └─────────┘   │   └──────────────────┘   │
│                 │                           │
│                 │   (빈 공간)               │
│                 │                           │
├─────────────────┴───────────────────────────┤
│  ● 온라인  동기화 중...  미동기: 2          │
└─────────────────────────────────────────────┘
```

---

## 📊 데이터 흐름

### 메모 작성 흐름

```
사용자 "+ 새 메모" 클릭
  ↓
NoteModal 열기
  ↓
메모 입력 + 색상 선택
  ↓
"저장" 클릭
  ↓
IPC: crud:create-note
  ↓
NotesRepository.createNote() (SQLite)
  ↓
응답 수신
  ↓
NotesStore.addNote() (상태 업데이트)
  ↓
UI 즉시 갱신
  ↓
SyncEngine 자동 감지
  ↓
Push (온라인 시)
```

### 메모 로드 흐름

```
날짜 선택
  ↓
loadNotes(date) 호출
  ↓
IPC: crud:get-note-by-date
  ↓
NotesRepository.getNotesByDate()
  ↓
응답 수신
  ↓
NotesStore.notes 맵에 저장
  ↓
NotesList 자동 렌더링
```

---

## 🔐 인증 흐름

### 로그인 프로세스 (향후)

```
1. LoginPage 표시
2. 사용자 "Google로 로그인" 클릭
3. Google OAuth 팝업 열기
4. 사용자 동의
5. ID Token 획득
6. 백엔드에 POST /api/auth/google
7. JWT + Refresh Token 수신
8. AuthStore에 저장
9. localStorage에 자동 저장
10. 앱 시작 시 자동 복구
```

### 토큰 관리

```
localStorage (클라이언트)
├── accessToken (15분 만료)
├── refreshToken (7일 만료)
├── userId
└── userEmail

(향후 자동 갱신 로직 필요)
```

---

## 📁 파일 구조 (Phase 2-3)

```
electron/src/renderer/
├── index.tsx                       ✨ 새로 생성
├── index.css                       ✨ 새로 생성
├── App.tsx                         ✏️ 로그인 통합
├── App.module.css                  ✨ 새로 생성
├── store/
│   ├── notes.ts                    ✨ 새로 생성
│   ├── sync.ts                     ✨ 새로 생성
│   └── auth.ts                     ✨ 새로 생성
├── components/
│   ├── Calendar.tsx                ✨ 새로 생성
│   ├── Calendar.module.css         ✨ 새로 생성
│   ├── NotesList.tsx               ✨ 새로 생성
│   ├── NotesList.module.css        ✨ 새로 생성
│   ├── NoteModal.tsx               ✨ 새로 생성
│   ├── NoteModal.module.css        ✨ 새로 생성
│   ├── SyncStatus.tsx              ✨ 새로 생성
│   └── SyncStatus.module.css       ✨ 새로 생성
└── pages/
    ├── LoginPage.tsx               ✨ 새로 생성
    └── LoginPage.module.css        ✨ 새로 생성

electron/src/main/
├── preload.ts                      ✨ 새로 생성
└── index.ts                        ✏️ 윈도우 크기 조정

backend/src/main/java/com/calendar/controller/
└── HealthController.java           ✨ 새로 생성
```

---

## 🚀 주요 특징

### 1. 오프라인 우선
- 인터넷 없어도 메모 작성 가능
- 온라인 복귀 시 자동 동기화

### 2. 실시간 UI 업데이트
- 메모 저장 후 즉시 표시
- 동기화 상태 실시간 반영

### 3. 색상 지원
- 5가지 프리셋 색상
- 각 메모 개별 색상

### 4. 반응형 디자인
- 태블릿/모바일 지원 (CSS)
- 휴대폰: 캘린더 숨김, 목록만 표시

### 5. 접근성
- 스크린 리더 고려
- 키보드 네비게이션 지원 (향후)
- 명확한 컬러 대비

---

## ⚙️ 기술 스택

| 영역 | 기술 |
|------|------|
| UI 프레임워크 | React 18 |
| 상태 관리 | Zustand |
| 날짜 처리 | date-fns |
| 스타일링 | CSS Modules |
| IPC 통신 | Electron IPC |
| 스토리지 | localStorage + SQLite |

---

## 🧪 테스트 시나리오

### 1. 로그인 테스트
```
✅ LoginPage 표시됨
✅ 테스트 모드에서 로그인 성공
✅ 토큰 localStorage에 저장됨
✅ 다시 시작 시 로그인 유지
```

### 2. 메모 작성 테스트
```
✅ "+ 새 메모" 클릭 → 모달 열림
✅ 메모 입력 후 색상 선택
✅ 저장 → 즉시 목록 업데이트
✅ 메모 클릭 → 수정 모드
✅ 삭제 → 확인 후 제거
```

### 3. 캘린더 네비게이션
```
✅ 이전/다음 월 버튼 작동
✅ 오늘 날짜 강조 표시
✅ 메모 있는 날짜 점 표시
✅ 다른 달 날짜는 비활성화
```

### 4. 동기화 상태 표시
```
✅ 온라인 상태 표시
✅ 동기화 중 스피너
✅ 미동기 개수 표시
✅ 에러 메시지 자동 숨김
```

---

## ⚠️ 알려진 제한사항

### 1. Google OAuth 미구현
- 테스트 모드만 지원
- 실제 Google OAuth 통합 필요

### 2. 토큰 자동 갱신 미구현
- 401 에러 시 수동 로그인 필요
- Token Refresh 로직 구현 필요

### 3. z-order 관리 미구현
- Windows 위젯 배치 미지원
- koffi + SetWindowPos 필요

### 4. 초기 상태 정리 미구현
- pull_in_progress=true 상태 정리 필요

---

## 🔜 다음 단계 (Phase 2-4)

### 우선순위

1. **Google OAuth 실제 구현**
   - google-auth-library 통합
   - 팝업 또는 리다이렉트 방식
   - 에러 처리

2. **Token Refresh 자동화**
   - 401 에러 감지
   - 자동 갱신 및 재요청
   - Refresh Token 만료 시 로그아웃

3. **앱 시작 정리**
   - pull_in_progress=true 상태 정리
   - 비정상 종료 복구

4. **z-order 관리 (Windows)**
   - koffi + SetWindowPos(HWND_BOTTOM)
   - 투명도 조정

5. **성능 최적화**
   - 메모 가상화 (많은 항목)
   - 캘린더 메모이제이션
   - 이미지 최적화

### 예상 기간
- Google OAuth 실제 구현: 2-3시간
- Token Refresh 로직: 2-3시간
- z-order 관리: 1-2시간
- 성능 최적화: 2-3시간

**총 예상 기간:** 1주 (Phase 2-4)

---

## 📊 코드 통계

### 렌더러 (React)
- 컴포넌트: 4개 (Calendar, NotesList, NoteModal, SyncStatus)
- 페이지: 1개 (LoginPage)
- 스토어: 3개 (notes, sync, auth)
- 총 줄수: ~800줄

### 스타일
- CSS Modules: 8개 파일
- 글로벌 CSS: 1개
- 총 줄수: ~400줄

### 백엔드
- HealthController: 1개 파일
- 총 줄수: ~10줄

### 메인 프로세스
- preload.ts: 신규
- index.ts: 수정 (윈도우 크기)

**Phase 2-3 총 코드량:** ~1,200줄

---

## 📝 개발 메모

### 사용한 라이브러리

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.1",
    "date-fns": "^2.30.0",
    "axios": "^1.6.0"
  }
}
```

### CSS-in-JS 선택 사항
- **선택:** CSS Modules (현재)
- **대안:** styled-components, Tailwind CSS
- **이유:** 심플, 성능, 격리

### 상태 관리 선택
- **선택:** Zustand (현재)
- **대안:** Redux, Recoil, Context API
- **이유:** 경량, 간단한 API, 성능

---

## 🎯 성공 지표

- ✅ 월간 캘린더 렌더링
- ✅ 메모 CRUD 작동
- ✅ 메모 색상 지정
- ✅ 동기화 상태 표시
- ✅ 로그인 페이지
- ✅ 네트워크 상태 표시
- ⏳ Google OAuth 실제 연동 (다음 단계)
- ⏳ Token 자동 갱신 (다음 단계)

---

## 📚 참고 문서

- [PROGRESS.md](../project-status/PROGRESS.md)
- [PHASE_2_2_IMPLEMENTATION.md](PHASE_2_2_IMPLEMENTATION.md)
- [ARCHITECTURE.md](../docs/ARCHITECTURE.md)
- React: https://react.dev
- Zustand: https://github.com/pmndrs/zustand
- date-fns: https://date-fns.org

---

**작성자:** Claude Code  
**최종 수정:** 2026-08-27  
**상태:** ✅ Phase 2-3 완료 (기본 기능)
