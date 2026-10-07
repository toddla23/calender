import Constants from 'expo-constants';

interface Extra {
  apiBaseUrl?: string;
  googleWebClientId?: string;
  googleIosClientId?: string;
  isProductionBuild?: boolean;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/** app.config.ts 의 extra (환경변수로 주입됨). 소스에 값을 하드코딩하지 않는다 */
export const env = {
  /** 기본 서버 주소. Android 에뮬레이터에서 호스트 PC의 localhost는 10.0.2.2 */
  apiBaseUrl: extra.apiBaseUrl || 'http://10.0.2.2:8080',
  googleWebClientId: extra.googleWebClientId ?? '',
  googleIosClientId: extra.googleIosClientId ?? '',
};

export const isGoogleConfigured = (): boolean => env.googleWebClientId.length > 0;

/** 이메일 개발 로그인은 개발 빌드(__DEV__)에서만 노출 */
export const devLoginEnabled = (): boolean => __DEV__;
