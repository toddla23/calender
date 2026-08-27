import jwtDecode from 'jwt-decode';

export interface GoogleIdToken {
  iss: string;
  azp: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  at_hash: string;
  iat: number;
  exp: number;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  userId: string;
  userEmail: string;
}

export class OAuthService {
  private static readonly BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080';

  static async exchangeGoogleToken(idToken: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${this.BACKEND_URL}/api/auth/google`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Google 인증 실패');
      }

      const data = await response.json();

      // 응답에서 토큰 추출
      const accessToken = data.accessToken;
      const refreshToken = data.refreshToken;

      // ID Token에서 사용자 정보 추출
      const decoded = jwtDecode<GoogleIdToken>(idToken);

      return {
        accessToken,
        refreshToken,
        userId: decoded.sub,
        userEmail: decoded.email,
      };
    } catch (error) {
      console.error('OAuth token exchange failed:', error);
      throw error;
    }
  }

  static async refreshAccessToken(refreshToken: string): Promise<string> {
    try {
      const response = await fetch(`${this.BACKEND_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      return data.accessToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  static decodeToken(token: string): any {
    try {
      return jwtDecode(token);
    } catch (error) {
      console.error('Failed to decode token:', error);
      return null;
    }
  }

  static isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) return true;

    const now = Math.floor(Date.now() / 1000);
    // 5분 여유 두고 만료 판단
    return decoded.exp - 300 < now;
  }
}
