# 08. 서버 운영 (라즈베리파이)

> ⚠️ **공개 서비스이므로 강한 비밀번호를 쓸 것.**
> Funnel 로 인터넷 전체에 공개된다. 로그인에 쓰는 Google 계정은 2단계 인증을 켜 두고, `.env` 의 `DB_PASSWORD` 는 20자 이상의 무작위 문자열을 쓴다. `.env` 는 `chmod 600` 으로 본인만 읽게 한다.

- 공개 주소: `https://raspberry-pi.tailb6b7a3.ts.net` (`PUBLIC_URL`)
- 서버: `127.0.0.1:3000` (D-004), MariaDB: 파이에 설치된 것 `127.0.0.1:3306`, DB·계정 `deskcal`

## 1. Google 로그인 준비 (처음 한 번)

1. [Google Cloud Console](https://console.cloud.google.com/) → **API 및 서비스 → OAuth 동의 화면**에서 앱을 만든다. 사용자 유형은 "외부", 테스트 사용자에 본인 Gmail 을 추가한다.
2. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI: `https://raspberry-pi.tailb6b7a3.ts.net/auth/google/callback`
3. 발급된 클라이언트 ID / 보안 비밀을 아래 `.env` 에 적는다.

윈도우 앱도 같은 클라이언트를 쓴다(D-003). 데스크톱용 클라이언트는 따로 만들지 않는다.

## 2. `.env` 작성 → 실행

```bash
git clone <이 저장소> deskcal && cd deskcal
cp .env.example .env
chmod 600 .env
nano .env            # DB_PASSWORD, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_EMAILS 채우기
mkdir -p backups     # 백업 폴더 (컨테이너는 UID 1000 으로 씀)
docker compose up -d --build
docker compose ps    # STATUS 가 healthy 가 되면 준비 완료
docker compose logs -f
```

- 표와 스키마는 서버가 시작할 때 마이그레이션으로 자동 생성된다.
- `ALLOWED_EMAILS` 가 비어 있으면 서버가 시작되지 않는다(D-002). 누구나 가입은 `*` (6절).
- 로그는 10MB × 3개로 로테이션된다.

`.env` 주요 항목 (전체는 `.env.example`):

| 이름 | 뜻 |
|---|---|
| `PUBLIC_URL` | Funnel 주소. OAuth 리디렉션 URI 기준 |
| `DB_*` | MariaDB 접속 정보 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | 1절에서 받은 값 |
| `ALLOWED_EMAILS` | 로그인 허용 이메일 (쉼표 구분). `*`면 누구나 가입 (D-017) |
| `ADMIN_EMAILS` | 관리자: 임시공휴일 편집, 용량·속도 제한 없음. 첫 번째 이메일이 기존 달력의 주인 (비우면 허용 목록 전체, `*`이면 필수) |
| `CONTACT_EMAIL` | 개인정보처리방침의 문의처 (`*`이면 필수, 아니면 `ADMIN_EMAILS` 첫 번째) |
| `MAX_USERS` | 누구나 가입일 때 가입 인원 (기본 50) |
| `USER_QUOTA_MB` | 관리자가 아닌 사용자의 메모·이력 용량, 각각 (기본 10) |
| `OPS_PER_MINUTE` | 관리자가 아닌 사용자의 1분 op 수 (기본 600) |
| `GOOGLE_SITE_VERIFICATION` | Search Console 소유권 확인 파일 이름 (예: `google1234abcd.html`, 6절) |
| `BACKUP_HOUR`, `BACKUP_KEEP` | 백업 시각(KST)·보관 개수 (기본 4시, 30개) |
| `HISTORY_KEEP` | 칸당 이력 개수 (기본 100) |
| `ANDROID_CERT_SHA256` | Play 앱 서명 지문 (07-release 5.4) |
| `PUID`, `PGID` | 컨테이너 실행 사용자 (`./backups` 쓰기 권한) |

`.env.example`에는 없지만 서버가 읽는 값 (`server/src/config.ts`):

| 이름 | 기본값 | 뜻 |
|---|---|---|
| `HOST` | `127.0.0.1` | `0.0.0.0`·`::`이면 시작 거부 |
| `PORT` | `3000` | 8080·3306·5432·22·111·631이면 시작 거부 |
| `BACKUP_ENABLED` | `true` | `false`면 자동 백업 끔 |
| `BACKUP_DIR` | `./backups` | 백업 폴더 |
| `EXTRA_CORS_ORIGINS` | 없음 | CORS 허용 출처 추가 (쉼표 구분) |
| `ANDROID_PACKAGE` | `io.github.toddla23.batangcalendar` | assetlinks에 넣는 패키지 이름 |
| `LOG_LEVEL` | `info` | 로그 수준 |

`assetlinks.json`에는 업로드 키 지문이 코드에 기본으로 들어 있고, `ANDROID_CERT_SHA256` 값은 거기에 더해진다.

DB 계정에 필요한 권한(이미 만들어 두었다면 확인만):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES, LOCK TABLES, SHOW VIEW
  ON deskcal.* TO 'deskcal'@'127.0.0.1';
```

## 3. Funnel 주소로 접속 확인

```bash
curl -s https://raspberry-pi.tailb6b7a3.ts.net/healthz    # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' https://raspberry-pi.tailb6b7a3.ts.net/api/me   # 401 (로그인 필요)
```

브라우저로 `https://raspberry-pi.tailb6b7a3.ts.net` 을 열고 **Google 계정으로 로그인**을 누르면 달력이 나온다.

## 4. 업데이트

```bash
docker compose exec deskcal node server/bundle/backup-cli.mjs   # 마이그레이션이 있는 업데이트 전에는 수동 백업
git pull && docker compose up -d --build
docker compose logs --tail 50 deskcal                            # 마이그레이션 오류가 없는지
```

- 002 마이그레이션(사용자별 달력, F16)은 기존 달력을 `ADMIN_EMAILS` 첫 번째 이메일(비어 있으면 `ALLOWED_EMAILS` 첫 번째)에게 넘긴다. 업데이트 전에 이 값이 본인 이메일인지 확인한다.
- 다른 이메일로 로그인했던 기기는 다시 로그인해야 하고, 빈 달력에서 시작한다.

## 5. 백업과 복원

매일 04:00(KST)에 `mariadb-dump --single-transaction` 결과를 `./backups/deskcal-YYYYMMDD-HHMMSS.sql.gz` 로 저장하고, 최근 30개만 남긴다(`BACKUP_HOUR`, `BACKUP_KEEP` 으로 변경).

지금 바로 백업:

```bash
docker compose exec deskcal node server/bundle/backup-cli.mjs
ls -lh backups/
```

### 복원

```bash
# 1) 서버를 멈춘다
docker compose stop deskcal

# 2) 복원할 파일을 고른다
ls -1 backups/ | tail

# 3) 현재 DB 를 비우고 백업을 넣는다 (파이에 설치된 mariadb 클라이언트 사용)
mariadb -u deskcal -p -h 127.0.0.1 -e "DROP DATABASE deskcal; CREATE DATABASE deskcal CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
#    ↑ 계정에 DB 생성 권한이 없으면 root 로 실행: sudo mariadb -e "..."
gunzip -c backups/deskcal-20261114-040000.sql.gz | mariadb -u deskcal -p -h 127.0.0.1 deskcal

# 4) 서버 시작
docker compose start deskcal
```

복원하면 서버의 변경 번호가 뒤로 돌아간다. 각 기기는 다시 연결될 때 이를 감지하고(`reset`) 달력을 처음부터 다시 받는다. 기기에 남아 있던 미전송 수정은 그대로 다시 보낸다 (03-protocol 5절).

JSON 백업도 쓸 수 있다. 앱 설정 → **JSON 내보내기**로 받은 파일을 **JSON 가져오기**로 넣으면 파일에 있는 날짜만 덮어쓴다(D-011).

## 6. 누구나 가입 켜기 (F17)

1. `.env`를 고친다.
   ```bash
   ALLOWED_EMAILS=*
   ADMIN_EMAILS=본인@gmail.com        # 첫 번째가 기존 달력의 주인
   CONTACT_EMAIL=문의받을@주소         # /privacy 에 공개된다
   MAX_USERS=50
   USER_QUOTA_MB=10
   OPS_PER_MINUTE=600
   ```
2. 홈페이지 소유권 확인 (Google Search Console, Cloud 프로젝트와 **같은 Google 계정**으로)
   - 속성 추가 → **URL 접두어** → `https://raspberry-pi.tailb6b7a3.ts.net/`
   - 확인 방법 **HTML 파일** → 받은 파일 이름(예: `google1234abcd.html`)을 `.env`의 `GOOGLE_SITE_VERIFICATION=`에 넣고 `docker compose up -d`
   - `curl https://raspberry-pi.tailb6b7a3.ts.net/google1234abcd.html` 이 `google-site-verification: google1234abcd.html` 을 돌려주면 Search Console 에서 **확인**
   - 도메인 속성(DNS TXT)은 `ts.net` DNS 를 직접 고칠 수 없어 쓸 수 없다
3. Google Cloud Console → **OAuth 동의 화면(브랜딩)**
   - 애플리케이션 홈페이지 `https://raspberry-pi.tailb6b7a3.ts.net/about` (로그인 없이 앱 설명이 보이는 페이지. `/`는 로그인 화면이라 거절된다)
   - 개인정보처리방침 `https://raspberry-pi.tailb6b7a3.ts.net/privacy`, 서비스 약관 `https://raspberry-pi.tailb6b7a3.ts.net/terms`
   - 승인된 도메인 `tailb6b7a3.ts.net` (받아 주지 않으면 `raspberry-pi.tailb6b7a3.ts.net`)
   - 범위는 `openid`, `email`만. 로고를 올리면 브랜드 인증이 필요하다
   - 소유권 확인 뒤 24시간 기다렸다가 인증을 다시 제출하고, **대상 → 프로덕션으로 푸시**. "테스트" 상태면 테스트 사용자로 등록한 계정만 로그인된다
4. `docker compose up -d` 후 확인:
   ```bash
   curl -s https://raspberry-pi.tailb6b7a3.ts.net/privacy | grep -c 개인정보   # 1 이상
   docker compose logs deskcal | grep '가입 인원 초과'                          # 인원이 찼는지
   ```
5. 저장 공간 점검: 사용자별 사용량은 DB에서 본다.
   ```sql
   SELECT email, ROUND(note_bytes/1048576,2) AS note_mb, ROUND(history_bytes/1048576,2) AS hist_mb, created_at FROM users ORDER BY note_bytes DESC;
   ```

- 다른 사람의 메모도 서버와 백업 파일(`./backups`)에 들어간다. 파이와 백업 파일을 남이 만질 수 없게 둔다.
- 특정 사용자를 막으려면 지금은 DB에서 그 사용자의 기기를 폐기한다: `UPDATE devices SET revoked_at = NOW(3) WHERE email = '...'`. 다시 로그인하는 것까지 막으려면 허용 목록 방식으로 돌아가야 한다.

