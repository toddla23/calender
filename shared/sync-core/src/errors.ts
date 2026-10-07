/** 서버에 닿지 못함 (오프라인, DNS 실패, 타임아웃, 홈서버 다운 등). 재시도 대상. */
export class NetworkError extends Error {
  constructor(message = '네트워크에 연결할 수 없습니다') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Refresh Token까지 만료/무효 → 재로그인 필요. 재시도하지 않는다. */
export class AuthExpiredError extends Error {
  constructor(message = '인증이 만료되었습니다. 다시 로그인해 주세요') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

/** 서버가 응답했으나 실패 (HTTP status 포함). 5xx는 재시도 대상. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
  get retryable(): boolean {
    return this.status >= 500;
  }
}

/** 삭제된 노트는 수정할 수 없다 (복구만 가능). */
export class NoteDeletedError extends Error {
  constructor(id: string) {
    super(`삭제된 노트는 수정할 수 없습니다: ${id}`);
    this.name = 'NoteDeletedError';
  }
}

export class NoteNotFoundError extends Error {
  constructor(id: string) {
    super(`노트를 찾을 수 없습니다: ${id}`);
    this.name = 'NoteNotFoundError';
  }
}
