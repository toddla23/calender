import React, { useState, useCallback } from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { OAuthService } from '../services/oauth.service';
import styles from './LoginPage.module.css';

interface LoginPageProps {
  onLoginSuccess: (accessToken: string, refreshToken: string, userId: string, userEmail: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLoginSuccess = useCallback(
    async (credentialResponse: CredentialResponse) => {
      if (!credentialResponse.credential) {
        setError('Google 로그인 실패: 자격증명을 받을 수 없습니다.');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const idToken = credentialResponse.credential;
        const authResponse = await OAuthService.exchangeGoogleToken(idToken);

        onLoginSuccess(
          authResponse.accessToken,
          authResponse.refreshToken,
          authResponse.userId,
          authResponse.userEmail
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Google 로그인 실패';
        setError(errorMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [onLoginSuccess]
  );

  const handleTestLogin = () => {
    // 테스트 모드 (개발용)
    setIsLoading(true);
    try {
      const testToken = 'test_jwt_token_' + Date.now();
      onLoginSuccess(testToken, 'test_refresh_token', 'test_user_id', 'test@example.com');
    } finally {
      setIsLoading(false);
    }
  };

  const googleClientId = process.env.REACT_APP_GOOGLE_CLIENT_ID;

  return (
    <div className={styles.loginPage}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>📅 캘린더</h1>
          <p className={styles.subtitle}>오프라인 지원 캘린더 앱</p>
        </div>

        <div className={styles.content}>
          <p className={styles.description}>Google 계정으로 로그인하여 시작하세요.</p>

          {googleClientId ? (
            <div className={styles.googleButtonContainer}>
              <GoogleLogin
                onSuccess={handleGoogleLoginSuccess}
                onError={() => setError('Google 로그인 실패')}
              />
            </div>
          ) : (
            <>
              <p className={styles.warning}>
                ⚠️ Google Client ID가 설정되지 않았습니다.
                <br />
                REACT_APP_GOOGLE_CLIENT_ID 환경변수를 설정해주세요.
              </p>
              <button
                className={styles.testButton}
                onClick={handleTestLogin}
                disabled={isLoading}
              >
                {isLoading ? '로그인 중...' : '테스트 모드로 로그인'}
              </button>
            </>
          )}

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.features}>
            <h3>주요 기능</h3>
            <ul>
              <li>✅ 오프라인 메모 작성</li>
              <li>✅ 온라인 복귀 시 자동 동기화</li>
              <li>✅ 모든 기기 간 동기화</li>
              <li>✅ 실시간 충돌 해결</li>
              <li>✅ 자동 토큰 갱신</li>
            </ul>
          </div>

          <div className={styles.setupGuide}>
            <h4>Google OAuth 설정:</h4>
            <ol>
              <li><a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer">Google Cloud Console</a> 방문</li>
              <li>프로젝트 생성 및 OAuth 2.0 ID 생성</li>
              <li>.env.local 파일에 다음 추가:
                <code>REACT_APP_GOOGLE_CLIENT_ID=your_client_id_here</code>
              </li>
              <li>앱 재시작</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
};
