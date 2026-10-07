import NetInfo from '@react-native-community/netinfo';
import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';
import { env } from '../config/env';
import { openNativeDriver } from '../db/open';
import { prefsKv, secureKv } from '../platform/native-kv';
import { AppRuntime } from './runtime';
import { StompClientCtor } from './stomp';

/** 실제 기기용 의존성으로 런타임 생성 (네이티브 모듈은 여기서만 연결) */
export function createNativeRuntime(): Promise<AppRuntime> {
  return AppRuntime.create({
    driver: openNativeDriver(),
    prefs: prefsKv,
    secure: secureKv,
    uuid: () => randomUUID(),
    netInfo: {
      addEventListener: (l) => NetInfo.addEventListener((s) => l({ isConnected: s.isConnected, isInternetReachable: s.isInternetReachable })),
    },
    appState: AppState,
    StompClient: StompClientCtor,
    defaultServerUrl: env.apiBaseUrl,
    logger: __DEV__ ? { debug: console.debug, warn: console.warn } : { warn: () => {} },
  });
}
