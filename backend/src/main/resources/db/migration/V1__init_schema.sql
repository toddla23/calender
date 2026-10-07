CREATE TABLE users (
    id          CHAR(36)     NOT NULL,
    email       VARCHAR(255) NOT NULL,
    google_sub  VARCHAR(255) NOT NULL,
    created_at  DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_google_sub (google_sub)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- date는 순수 날짜(DATE), updated_at은 서버가 UTC로 발급하는 동기화 기준 시각(DATETIME(6))
CREATE TABLE notes (
    id               CHAR(36)    NOT NULL,
    user_id          CHAR(36)    NOT NULL,
    `date`           DATE        NOT NULL,
    content          TEXT        NOT NULL,
    color            VARCHAR(32) NOT NULL DEFAULT '',
    deleted          TINYINT(1)  NOT NULL DEFAULT 0,
    deleted_version  INT         NOT NULL DEFAULT 0,
    updated_at       DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_notes_user_updated (user_id, updated_at, id),
    KEY idx_notes_user_date (user_id, `date`),
    CONSTRAINT fk_notes_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE holidays (
    id        BIGINT       NOT NULL AUTO_INCREMENT,
    year      INT          NOT NULL,
    `date`    DATE         NOT NULL,
    name      VARCHAR(100) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_holidays_date_name (`date`, name),
    KEY idx_holidays_year (year)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 공휴일 API를 연도별로 조회했음을 기록 (공휴일이 없는 해도 재조회하지 않기 위함)
CREATE TABLE holiday_years (
    year        INT         NOT NULL,
    fetched_at  DATETIME(6) NOT NULL,
    PRIMARY KEY (year)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
