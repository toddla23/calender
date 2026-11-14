-- 날짜 칸 현재 상태. version 은 저장할 때마다 1씩 오른다.
CREATE TABLE notes (
  date        DATE         NOT NULL PRIMARY KEY,
  content     MEDIUMTEXT   NOT NULL,
  color       VARCHAR(16)  NULL,
  version     INT UNSIGNED NOT NULL,
  conflict    TINYINT(1)   NOT NULL DEFAULT 0,
  updated_at  DATETIME(3)  NOT NULL,
  device_id   INT UNSIGNED NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 서버 변경 번호(seq). since= 조회와 실시간 이벤트 순서의 기준.
CREATE TABLE changes (
  seq         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  date        DATE         NOT NULL,
  version     INT UNSIGNED NOT NULL,
  device_id   INT UNSIGNED NULL,
  created_at  DATETIME(3)  NOT NULL,
  KEY idx_changes_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 쓰기 직렬화용 단일 행. 변경 번호가 커밋 순서와 일치하도록 모든 쓰기 트랜잭션이 이 행을 잠근다.
CREATE TABLE sync_lock (
  id TINYINT NOT NULL PRIMARY KEY
) ENGINE=InnoDB;
INSERT INTO sync_lock (id) VALUES (1);

-- 날짜 칸별 수정 이력.
CREATE TABLE note_history (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  date        DATE         NOT NULL,
  version     INT UNSIGNED NOT NULL,
  content     MEDIUMTEXT   NOT NULL,
  color       VARCHAR(16)  NULL,
  reason      VARCHAR(20)  NOT NULL,
  device_id   INT UNSIGNED NULL,
  created_at  DATETIME(3)  NOT NULL,
  KEY idx_history_date (date, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 처리한 opId. 재전송된 op 를 한 번만 반영하고 같은 응답을 돌려주기 위해 보관.
CREATE TABLE applied_ops (
  op_id       CHAR(36)     NOT NULL PRIMARY KEY,
  device_id   INT UNSIGNED NULL,
  response    MEDIUMTEXT   NOT NULL,
  created_at  DATETIME(3)  NOT NULL,
  KEY idx_ops_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 직접 추가한 임시공휴일.
CREATE TABLE custom_holidays (
  date        DATE         NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  created_at  DATETIME(3)  NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 기기별 로그인 토큰. 토큰 원문은 저장하지 않고 SHA-256 해시만 저장.
CREATE TABLE devices (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email        VARCHAR(320) NOT NULL,
  name         VARCHAR(100) NOT NULL,
  kind         VARCHAR(10)  NOT NULL,
  token_hash   CHAR(64)     NOT NULL,
  created_at   DATETIME(3)  NOT NULL,
  last_used_at DATETIME(3)  NOT NULL,
  last_ip      VARCHAR(45)  NULL,
  revoked_at   DATETIME(3)  NULL,
  UNIQUE KEY uq_devices_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
