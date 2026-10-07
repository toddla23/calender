import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Session, SessionStorage } from './auth';

/** Electron safeStorage에서 필요한 부분만 (테스트 주입용) */
export interface SecretBox {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

/**
 * 토큰을 OS 자격증명(DPAPI)으로 암호화해 userData에 저장한다.
 * 암호화를 쓸 수 없으면 디스크에 평문으로 쓰지 않고 메모리에만 보관한다 (재시작 시 재로그인).
 */
export class SafeSessionStorage implements SessionStorage {
  private memory: Session | null = null;

  constructor(
    private readonly file: string,
    private readonly box: SecretBox,
    private readonly warn: (msg: string) => void = console.warn,
  ) {}

  load(): Session | null {
    if (!this.box.isAvailable() || !existsSync(this.file)) return null;
    try {
      const s = JSON.parse(this.box.decrypt(readFileSync(this.file))) as Session;
      if (s?.accessToken && s.refreshToken && s.user?.id) return s;
    } catch (e) {
      this.warn(`저장된 토큰을 읽을 수 없어 무시합니다: ${(e as Error).message}`);
    }
    return null;
  }

  save(session: Session | null): void {
    this.memory = session;
    if (session === null) {
      rmSync(this.file, { force: true });
      return;
    }
    if (!this.box.isAvailable()) {
      this.warn('safeStorage 암호화를 사용할 수 없어 토큰을 디스크에 저장하지 않습니다');
      return;
    }
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, this.box.encrypt(JSON.stringify(session)));
  }

  /** 테스트/진단용 */
  get inMemory(): Session | null {
    return this.memory;
  }
}
