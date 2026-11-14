import type { KV } from './engine';

/** IndexedDB 기반 키-값 저장소 (웹앱 오프라인 캐시·큐) */
export class IdbKV implements KV {
  private dbp: Promise<IDBDatabase>;
  constructor(name = 'deskcal') {
    this.dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async get<T>(key: string): Promise<T | undefined> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => reject(r.error);
    });
  }
  async set(key: string, value: unknown): Promise<void> {
    const db = await this.dbp;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}

export class MemoryKV implements KV {
  data = new Map<string, string>();
  async get<T>(key: string) {
    const v = this.data.get(key);
    return v === undefined ? undefined : (JSON.parse(v) as T);
  }
  async set(key: string, value: unknown) {
    this.data.set(key, JSON.stringify(value));
  }
}
