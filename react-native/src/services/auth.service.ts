import axios, { AxiosInstance } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  userId: string;
  userEmail: string;
}

export class AuthService {
  private static apiClient: AxiosInstance;

  static initialize() {
    this.apiClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
    });

    // Add token to requests
    this.apiClient.interceptors.request.use(async (config) => {
      const token = await AsyncStorage.getItem('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle token refresh
    this.apiClient.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          try {
            const refreshToken = await AsyncStorage.getItem('refresh_token');
            if (refreshToken) {
              const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
                refreshToken,
              });

              await AsyncStorage.setItem(
                'access_token',
                response.data.accessToken
              );

              error.config.headers.Authorization = `Bearer ${response.data.accessToken}`;
              return axios(error.config);
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            await AsyncStorage.removeItem('access_token');
            await AsyncStorage.removeItem('refresh_token');
          }
        }
        return Promise.reject(error);
      }
    );
  }

  static async loginWithGoogle(): Promise<AuthResponse> {
    try {
      // In a real app, use react-native-google-signin or similar
      const response = await this.apiClient.post('/auth/google/login', {
        idToken: 'mock-token', // Replace with actual token from SDK
      });

      const { accessToken, refreshToken, userId, userEmail } = response.data;

      await AsyncStorage.setItem('access_token', accessToken);
      await AsyncStorage.setItem('refresh_token', refreshToken);
      await AsyncStorage.setItem('user_id', userId);

      return {
        accessToken,
        refreshToken,
        userId,
        userEmail,
      };
    } catch (error) {
      throw new Error('Google login failed');
    }
  }

  static async loginWithNaver(): Promise<AuthResponse> {
    try {
      // In a real app, use react-native-naver-login or similar
      const response = await this.apiClient.post('/auth/naver/login', {
        accessToken: 'mock-token', // Replace with actual token from SDK
      });

      const { accessToken, refreshToken, userId, userEmail } = response.data;

      await AsyncStorage.setItem('access_token', accessToken);
      await AsyncStorage.setItem('refresh_token', refreshToken);
      await AsyncStorage.setItem('user_id', userId);

      return {
        accessToken,
        refreshToken,
        userId,
        userEmail,
      };
    } catch (error) {
      throw new Error('Naver login failed');
    }
  }

  static async logout(): Promise<void> {
    try {
      await this.apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      await AsyncStorage.removeItem('access_token');
      await AsyncStorage.removeItem('refresh_token');
      await AsyncStorage.removeItem('user_id');
    }
  }

  static async refreshToken(): Promise<void> {
    const refreshToken = await AsyncStorage.getItem('refresh_token');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refreshToken,
      });

      const { accessToken } = response.data;
      await AsyncStorage.setItem('access_token', accessToken);
    } catch (error) {
      await AsyncStorage.removeItem('access_token');
      await AsyncStorage.removeItem('refresh_token');
      throw error;
    }
  }

  static getApiClient(): AxiosInstance {
    if (!this.apiClient) {
      this.initialize();
    }
    return this.apiClient;
  }
}
