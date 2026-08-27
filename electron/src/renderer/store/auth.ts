import { create } from 'zustand';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  userEmail: string | null;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string, userId: string, userEmail: string) => void;
  logout: () => void;
  restoreFromStorage: () => void;
}

const STORAGE_KEY = 'calendar_auth';

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  userId: null,
  userEmail: null,
  isAuthenticated: false,

  login: (accessToken, refreshToken, userId, userEmail) => {
    set({
      accessToken,
      refreshToken,
      userId,
      userEmail,
      isAuthenticated: true,
    });

    // localStorage에 저장
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          accessToken,
          refreshToken,
          userId,
          userEmail,
        })
      );
    } catch (error) {
      console.error('Failed to save auth to storage:', error);
    }
  },

  logout: () => {
    set({
      accessToken: null,
      refreshToken: null,
      userId: null,
      userEmail: null,
      isAuthenticated: false,
    });

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to remove auth from storage:', error);
    }
  },

  restoreFromStorage: () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { accessToken, refreshToken, userId, userEmail } = JSON.parse(stored);
        set({
          accessToken,
          refreshToken,
          userId,
          userEmail,
          isAuthenticated: true,
        });
      }
    } catch (error) {
      console.error('Failed to restore auth from storage:', error);
    }
  },
}));
