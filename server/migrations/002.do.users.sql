-- 사용자별 달력 (D-015).
-- users.last_seq 는 사용자별 변경 번호, note_bytes·history_bytes 는 저장 용량(내용 바이트 + 행마다 100).
-- 모든 쓰기 트랜잭션은 자기 users 행을 잠가 직렬화한다 (D-014 의 sync_lock 을 대체, D-016).
CREATE TABLE users (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(320)    NOT NULL,
  last_seq      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  note_bytes    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  history_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  created_at    DATETIME(3)     NOT NULL,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 지금까지의 달력 하나는 id=1 사용자 것이 된다. 이메일은 서버가 시작할 때 주인(ADMIN_EMAILS 첫 번째)으로 채운다.
-- 빈 이메일 = 아직 주인을 정하지 않음.
INSERT INTO users (id, email, last_seq, note_bytes, history_bytes, created_at)
SELECT 1, '',
  COALESCE((SELECT MAX(seq) FROM changes), 0),
  COALESCE((SELECT SUM(LENGTH(content) + 100) FROM notes), 0),
  COALESCE((SELECT SUM(LENGTH(content) + 100) FROM note_history), 0),
  NOW(3);

ALTER TABLE notes
  ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 1 FIRST,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (user_id, date);
ALTER TABLE notes ALTER COLUMN user_id DROP DEFAULT;

-- 같은 날짜의 예전 변경 번호는 since 조회에 필요 없으므로 마지막 것만 남긴다.
DELETE c FROM changes c JOIN changes c2 ON c2.date = c.date AND c2.seq > c.seq;
ALTER TABLE changes
  ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 1 FIRST,
  MODIFY seq BIGINT UNSIGNED NOT NULL,
  DROP PRIMARY KEY,
  ADD PRIMARY KEY (user_id, seq),
  DROP KEY idx_changes_date,
  ADD KEY idx_changes_user_date (user_id, date);
ALTER TABLE changes ALTER COLUMN user_id DROP DEFAULT;

ALTER TABLE note_history
  ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER id,
  DROP KEY idx_history_date,
  ADD KEY idx_history_user_date (user_id, date, id),
  ADD KEY idx_history_user_id (user_id, id);
ALTER TABLE note_history ALTER COLUMN user_id DROP DEFAULT;

ALTER TABLE applied_ops
  ADD COLUMN user_id INT UNSIGNED NOT NULL DEFAULT 1 AFTER op_id;
ALTER TABLE applied_ops ALTER COLUMN user_id DROP DEFAULT;

-- 기기 토큰은 사용자에 묶는다. 기존 기기는 서버 시작 시 이메일로 연결한다(주인이 아닌 이메일은 다시 로그인).
ALTER TABLE devices
  ADD COLUMN user_id INT UNSIGNED NULL AFTER id,
  ADD KEY idx_devices_user (user_id);

DROP TABLE sync_lock;
