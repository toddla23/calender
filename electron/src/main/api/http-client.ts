import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import { SYNC_CONSTANTS } from '../../shared/sync-core/constants';
import { TokenManager } from './token-manager';

export interface HttpClientConfig {
  baseURL: string;
  accessToken?: string;
  tokenManager?: TokenManager;
}

export class HttpClient {
  private client: AxiosInstance;
  private tokenManager: TokenManager | null;

  constructor(config: HttpClientConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: SYNC_CONSTANTS.REQUEST_TIMEOUT_MS,
    });

    this.tokenManager = config.tokenManager || null;

    if (config.accessToken) {
      this.setAccessToken(config.accessToken);
    }

    // 요청 인터셉터: 토큰 검증
    this.client.interceptors.request.use(
      async (requestConfig: InternalAxiosRequestConfig) => {
        if (this.tokenManager) {
          try {
            const validToken = await this.tokenManager.ensureTokenValid();
            requestConfig.headers.Authorization = `Bearer ${validToken}`;
          } catch (error) {
            console.error('Token validation failed:', error);
          }
        }
        return requestConfig;
      },
      (error) => Promise.reject(error)
    );

    // 응답 인터셉터: 401 에러 시 토큰 갱신
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401 && this.tokenManager) {
          try {
            await this.tokenManager.refreshAccessToken();
            // 원래 요청 재시도
            const originalRequest = error.config as any;
            if (originalRequest) {
              const validToken = this.tokenManager.getAccessToken();
              originalRequest.headers.Authorization = `Bearer ${validToken}`;
              return this.client(originalRequest);
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            this.tokenManager.clearTokens();
            // 로그인 페이지로 리다이렉트 필요
          }
        }
        return Promise.reject(error);
      }
    );
  }

  setAccessToken(token: string): void {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearAccessToken(): void {
    delete this.client.defaults.headers.common['Authorization'];
  }

  async get<T>(url: string): Promise<T> {
    const response = await this.client.get<T>(url);
    return response.data;
  }

  async post<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.post<T>(url, data);
    return response.data;
  }

  async put<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.put<T>(url, data);
    return response.data;
  }

  async patch<T>(url: string, data?: any): Promise<T> {
    const response = await this.client.patch<T>(url, data);
    return response.data;
  }

  async delete<T>(url: string): Promise<T> {
    const response = await this.client.delete<T>(url);
    return response.data;
  }
}
