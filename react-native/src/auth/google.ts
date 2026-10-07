import { GoogleSignin, isErrorWithCode, statusCodes } from '@react-native-google-signin/google-signin';
import { env, isGoogleConfigured } from '../config/env';

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  GoogleSignin.configure({
    // webClientId: ID Token의 audience. 백엔드가 검증하는 클라이언트 ID와 같아야 한다.
    webClientId: env.googleWebClientId,
    iosClientId: env.googleIosClientId || undefined,
  });
  configured = true;
}

export class GoogleSignInCancelled extends Error {
  constructor() {
    super('로그인이 취소되었습니다');
    this.name = 'GoogleSignInCancelled';
  }
}

/** Google 로그인 → ID Token. 서버(POST /api/auth/google)가 이 토큰을 검증한다 */
export async function getGoogleIdToken(): Promise<string> {
  if (!isGoogleConfigured()) {
    throw new Error('Google 로그인이 설정되지 않았습니다 (GOOGLE_WEB_CLIENT_ID)');
  }
  ensureConfigured();
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (res.type !== 'success') throw new GoogleSignInCancelled();
    const idToken = res.data.idToken;
    if (!idToken) throw new Error('Google에서 ID Token을 받지 못했습니다');
    return idToken;
  } catch (e) {
    if (e instanceof GoogleSignInCancelled) throw e;
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) throw new GoogleSignInCancelled();
    throw e;
  }
}

/** 로그아웃 시 Google 계정 선택 상태도 초기화 (실패해도 무시) */
export async function googleSignOut(): Promise<void> {
  try {
    if (isGoogleConfigured()) {
      ensureConfigured();
      await GoogleSignin.signOut();
    }
  } catch {
    /* 무시 */
  }
}
