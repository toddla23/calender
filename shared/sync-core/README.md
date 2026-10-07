# @calendar/sync-core

Electron / React Native가 공유하는 동기화 코어. 플랫폼 의존 없는 순수 TypeScript (fetch, AbortController만 사용).
설계 근거는 루트 `calendar-app-plan.md` 5장.

```
소스 직접 참조 (별도 빌드 없음): "@calendar/sync-core" → shared/sync-core/src/index.ts
테스트: npm test   (MemoryStore / SqlStore 양쪽에 같은 시나리오 32개)
```

## 구성

| 모듈 | 역할 |
|---|---|
| `SqlStore` + `SqlDriver` | SQLite 로컬 저장소. 플랫폼은 `exec/run/all` 3개 메서드만 구현 |
| `SyncEngine` | Push → Pull 루틴. single-flight, 지수 백오프, 청크/커서 Pull 재개, 상태 이벤트 |
| `NoteService` | 쓰기 경로. 로컬 즉시 저장(synced=0) → 백그라운드 Push. 삭제된 노트 수정 불가/복구 |
| `HttpApiClient` | fetch 기반 API. 401 시 refresh 1회 재시도, 타임아웃, 오류 분류 |
| `createRealtimeClient` | STOMP 구독(`/topic/notes/{userId}`). `@stomp/stompjs`의 `Client`를 주입 |
| `MemoryStore` | 테스트용 참조 구현 |

## 사용 순서

```ts
const store  = await SqlStore.open(driver);                    // 플랫폼 SqlDriver
const api    = new HttpApiClient({ baseUrl, getAccessToken, refreshAccessToken, deviceId, connectionId });
const engine = new SyncEngine({ store, api });
const notes  = new NoteService({ store, engine, newId: () => uuidv4() });

engine.on((e) => { /* status | notes-changed | pull-progress | warning */ });
engine.notifyOnline();       // 오프라인 → 온라인
engine.notifyForeground();   // 모바일 포그라운드 복귀
```

## 플랫폼이 책임지는 것

- **deviceId**: 앱 설치당 UUID 1개를 영속 저장. **connectionId**: 프로세스/창마다 새로 생성 (에코 루프 방지용 origin)
- **토큰 저장**: Access/Refresh JWT 보관(Electron safeStorage, RN SecureStore/Keychain). `refreshAccessToken`이 새 access token 반환, 실패 시 `AuthExpiredError`
- **로그아웃**: `store.clearAll()` (노트 + Push 큐 + Pull cursor 초기화) 후 토큰 삭제
- **네트워크 감지**: `navigator.onLine`/NetInfo를 신뢰하지 말고 `api.ping()`으로 확인, 상태 변화 시 `engine.notifyOnline()/notifyOffline()`
- **`auth-expired` 상태**: 재로그인 UI로 유도, 로그인 후 `engine.resetAuth()` + `engine.sync()`
- UI는 항상 **로컬 DB 기준**으로 렌더링하고 `notes-changed` 이벤트에서 다시 조회

## 서버 계약 (backend)

- `POST /api/auth/google {idToken}` → `{accessToken, refreshToken, expiresIn, user}`
- `POST /api/auth/refresh {refreshToken}` → 같은 형태 (access/refresh 모두 재발급)
- `POST /api/auth/dev {email}` → 로컬 개발용 (서버가 local 프로파일일 때만)
- `GET /api/holidays?year=` → `[{date, name}]`
- 오류 본문: `{code, message}`
