# 📚 캘린더 앱 가이드 (Guide)

**모든 운영/배포/테스트 가이드가 여기에 있습니다.**

---

## 📖 가이드 맵

### 🚀 빠른 시작 (처음 시작하는 사람)
**파일:** [`QUICK_START.md`](./QUICK_START.md)  
**시간:** 10-15분  
**내용:**
- 5분 안에 시작하기
- 기본 명령어
- 간단한 문제 해결

→ **이 문서부터 읽으세요!** ✨

---

### 🧪 테스트 가이드 (QA, 테스터)
**파일:** [`TESTING_GUIDE.md`](./TESTING_GUIDE.md)  
**시간:** 8-10시간  
**내용:**
- 14개 상세 테스트 시나리오
- Phase별 테스트 (2-4, 3-1, 3-2)
- 성능 및 통합 테스트
- 테스트 결과 보고 템플릿

→ **배포 전 반드시 실행하세요!** ✅

---

### 🚀 배포 가이드 (DevOps, 배포자)
**파일:** [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md)  
**시간:** 4-6시간  
**내용:**
- 백엔드 배포 (Spring Boot)
- Electron 배포 (Desktop)
- iOS 배포 (App Store)
- Android 배포 (Google Play)
- 롤백 절차

→ **배포 전에 이 문서를 정독하세요!** 📤

---

### 📡 API 레퍼런스 (개발자)
**파일:** [`API_REFERENCE.md`](./API_REFERENCE.md)  
**내용:**
- REST API 엔드포인트
- WebSocket 메시지 형식
- 인증 방식
- cURL 예제
- HTTP 상태 코드

→ **API 호출 시 참고하세요!** 🔌

---

### 🔧 문제 해결 (모두)
**파일:** [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)  
**내용:**
- 14개 일반 문제 및 해결책
- 시작 관련 문제
- 연결 관련 문제
- 인증 관련 문제
- 성능 관련 문제
- 로그 분석 방법

→ **문제가 생기면 이 문서를 확인하세요!** 🔍

---

## 📊 상황별 가이드 선택

### "방금 프로젝트를 받았는데 뭘 해야 하나요?"
→ [`QUICK_START.md`](./QUICK_START.md) 읽기

### "개발 환경을 세팅해야 해요"
→ [`QUICK_START.md`](./QUICK_START.md) → 로컬에서 실행

### "테스트를 해야 합니다"
→ [`TESTING_GUIDE.md`](./TESTING_GUIDE.md) 읽고 실행

### "프로덕션에 배포해야 합니다"
→ [`DEPLOYMENT_GUIDE.md`](./DEPLOYMENT_GUIDE.md) 따라 진행

### "API를 호출해야 합니다"
→ [`API_REFERENCE.md`](./API_REFERENCE.md) 참고

### "문제가 발생했습니다"
→ [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) 확인

---

## 🎯 체크리스트

### 신규 개발자
- [ ] `QUICK_START.md` 읽기
- [ ] 로컬에서 앱 실행
- [ ] 메모 생성/수정/삭제 테스트
- [ ] 코드 탐색
- [ ] 첫 Pull Request 준비

### 테스터
- [ ] `QUICK_START.md` 읽기
- [ ] 테스트 환경 설정
- [ ] `TESTING_GUIDE.md` 실행
- [ ] 테스트 결과 보고서 작성
- [ ] 발견된 버그 보고

### DevOps 엔지니어
- [ ] `DEPLOYMENT_GUIDE.md` 정독
- [ ] 배포 전 체크리스트 확인
- [ ] 배포 실행
- [ ] 배포 후 모니터링
- [ ] 문제 시 `TROUBLESHOOTING.md` 참고

### 운영팀
- [ ] 모니터링 도구 설정
- [ ] 로그 확인 방법 학습
- [ ] `TROUBLESHOOTING.md` 숙지
- [ ] 장애 대응 절차 수립

---

## 📋 파일 요약

| 파일 | 크기 | 라인 | 대상 | 읽는 시간 |
|------|------|------|------|----------|
| QUICK_START.md | 3.4K | 150 | 모두 | 5분 |
| TESTING_GUIDE.md | 16K | 600 | QA | 2시간 |
| DEPLOYMENT_GUIDE.md | 12K | 500 | DevOps | 2시간 |
| API_REFERENCE.md | 6.7K | 350 | 개발자 | 30분 |
| TROUBLESHOOTING.md | 9.0K | 400 | 모두 | 1시간 |
| **총합** | **52K** | **2,604** | - | - |

---

## 🔗 관련 문서

**프로젝트 상태 문서 (project-status/):**
- [`00_PROJECT_OVERVIEW.md`](../project-status/00_PROJECT_OVERVIEW.md) — 프로젝트 전체 개요
- [`01_CURRENT_STATUS.md`](../project-status/01_CURRENT_STATUS.md) — 현재 상세 상태
- [`02_PHASE_2_4_SUMMARY.md`](../project-status/02_PHASE_2_4_SUMMARY.md) — Phase 2-4 요약
- [`03_PHASE_3_1_SUMMARY.md`](../project-status/03_PHASE_3_1_SUMMARY.md) — Phase 3-1 요약
- [`04_PHASE_3_2_SUMMARY.md`](../project-status/04_PHASE_3_2_SUMMARY.md) — Phase 3-2 요약
- [`05_TEST_AND_DEPLOYMENT.md`](../project-status/05_TEST_AND_DEPLOYMENT.md) — 테스트 및 배포

---

## 💡 팁

1. **북마크하기** — 자주 참고할 문서를 북마크
2. **검색하기** — Ctrl+F로 문서 내 키워드 검색
3. **링크 따라가기** — 문서의 상호 참조 링크 활용
4. **질문하기** — 명확하지 않은 부분은 팀에 질문
5. **업데이트 확인** — 주기적으로 최신 버전 확인

---

## 📞 지원

### 질문/이슈 보고
- 팀 Slack: `#help` 채널
- 또는 GitHub Issues

### 피드백
- 가이드 개선 사항 제안
- 오류/오타 보고
- 새로운 가이드 요청

---

## ✅ 이 문서 완성도

- ✅ 빠른 시작 가이드
- ✅ 상세 테스트 가이드 (14개 시나리오)
- ✅ 전체 배포 가이드 (4개 플랫폼)
- ✅ API 레퍼런스 (완전)
- ✅ 문제 해결 가이드 (14개 문제)

**총 2,600+ 줄의 상세한 가이드 문서!** 📚

---

**준비 완료! 프로젝트를 시작하세요! 🚀**

마지막 업데이트: 2026-08-27  
버전: 1.0
