import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { KeyValueStore } from './kv';

/** 토큰 등 비밀: iOS Keychain / Android Keystore 기반 SecureStore */
export const secureKv: KeyValueStore = {
  get: (k) => SecureStore.getItemAsync(k),
  set: (k, v) => SecureStore.setItemAsync(k, v),
  remove: (k) => SecureStore.deleteItemAsync(k),
};

/** 비밀이 아닌 설정(서버 주소, deviceId 등). 앱 삭제 시 함께 지워진다 */
export const prefsKv: KeyValueStore = {
  get: (k) => AsyncStorage.getItem(k),
  set: (k, v) => AsyncStorage.setItem(k, v),
  remove: (k) => AsyncStorage.removeItem(k),
};
