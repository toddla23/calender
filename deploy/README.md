# 홈서버 배포 (DDNS + Caddy + MariaDB + Spring Boot)

계획서 7장 구성. 저전력 미니PC/라즈베리파이 상시 가동 권장.

1. **DDNS**: DuckDNS 등으로 도메인 발급, 공인 IP 변경 시 자동 갱신(공유기 DDNS 기능 또는 cron).
2. **공유기 포트포워딩**: 외부 80, 443 → 서버 PC의 80, 443. (8080/3306은 외부에 열지 않는다)
3. **환경변수**: `.env.example`을 `.env`로 복사해 `DB_PASSWORD`, `JWT_SECRET`(32바이트 이상), `GOOGLE_CLIENT_IDS`, `HOLIDAY_API_KEY`, `DOMAIN` 설정.
4. **기동**:
   ```bash
   docker compose --profile app up -d --build
   docker compose logs -f backend
   ```
5. **확인**: `https://$DOMAIN/actuator/health` → `{"status":"UP"}`.
6. **클라이언트**: Electron/RN 설정의 서버 주소를 `https://$DOMAIN`으로. WebSocket은 `wss://$DOMAIN/ws`.

## 보안 체크리스트
- 운영에서는 `DEV_LOGIN_ENABLED`를 켜지 않는다 (기본 false, local 프로파일에서만 true).
- DB 포트(3306)는 외부에 노출하지 않는다. 앱 전용 계정(`calendar`)을 쓰고 root는 사용하지 않는다.
- OS/Docker 이미지를 정기적으로 업데이트한다.
- 서버 시계는 NTP로 동기화한다 (Pull의 `serverTime` 역행 감지의 근거).

## 외부 MariaDB를 쓰는 경우
`docker-compose.yml`의 `mariadb` 서비스 대신 기존 서버를 쓰려면 `backend`의 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`만 바꾸고 `depends_on`을 제거한다.
`calendar_db` 전용 계정 생성 예:
```sql
CREATE DATABASE calendar_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'calendar'@'%' IDENTIFIED BY '<강력한 비밀번호>';
GRANT ALL PRIVILEGES ON calendar_db.* TO 'calendar'@'%';
```
