import { ipcMain } from 'electron';
import { SyncMetaRepository } from '../db/queries/sync-meta';
import { OAuthService } from '../../renderer/services/oauth.service';

export type TokenRefreshErrorCallback = () => void;

export class TokenManager {
  private syncMetaRepo: SyncMetaRepository;
  private isRefreshing = false;
  private refreshPromise: Promise<string> | null = null;
  private errorCallbacks: TokenRefreshErrorCallback[] = [];

  constructor() {
    this.syncMetaRepo = new SyncMetaRepository();
  }

  onRefreshError(callback: TokenRefreshErrorCallback): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback);
    };
  }

  private notifyRefreshError(): void {
    this.errorCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (error) {
        console.error('Error in token refresh error callback:', error);
      }
    });
  }

  getAccessToken(): string | null {
    return this.syncMetaRepo.getAccessToken();
  }

  getRefreshToken(): string | null {
    return this.syncMetaRepo.getRefreshToken();
  }

  async refreshAccessToken(): Promise<string> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.notifyRefreshError();
      throw new Error('No refresh token available');
    }

    // 이미 갱신 중이면 기존 Promise 반환
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;

    try {
      this.refreshPromise = OAuthService.refreshAccessToken(refreshToken);
      const newAccessToken = await this.refreshPromise;

      // 새 토큰 저장
      const meta = this.syncMetaRepo.getSyncMeta();
      this.syncMetaRepo.setAuthTokens(
        newAccessToken,
        refreshToken,
        meta.user_id || '',
        meta.user_email || ''
      );

      return newAccessToken;
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.notifyRefreshError();
      throw error;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  async ensureTokenValid(): Promise<string> {
    const accessToken = this.getAccessToken();
    if (!accessToken) {
      throw new Error('No access token');
    }

    if (OAuthService.isTokenExpired(accessToken)) {
      return this.refreshAccessToken();
    }

    return accessToken;
  }

  clearTokens(): void {
    this.syncMetaRepo.clearAuthTokens();
  }
}
