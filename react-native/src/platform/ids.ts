import type { KeyValueStore } from './kv';

const DEVICE_ID_KEY = 'deviceId';

/** 앱 설치당 1개의 UUID. 최초 호출 때 생성해 영속 저장 */
export async function getOrCreateDeviceId(prefs: KeyValueStore, uuid: () => string): Promise<string> {
  const existing = await prefs.get(DEVICE_ID_KEY);
  if (existing) return existing;
  const id = uuid();
  await prefs.set(DEVICE_ID_KEY, id);
  return id;
}
