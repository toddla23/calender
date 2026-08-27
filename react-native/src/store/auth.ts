import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  userEmail: string | null;
  isAuthenticated: boolean;
  login: (accessToken: string, refreshToken: string, userId: string, userEmail: string) => void;
  logout: () => void;
  restoreFromStorage: () => Promise<void>;
}

const STORAGE_KEY = 'calendar_auth';

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  refreshToken: null,
  userId: null,
  userEmail: null,
  isAuthenticated: false,

  login: async (accessToken, refreshToken, userId, userEmail) => {
    set({
      accessToken,
      refreshToken,
      userId,
      userEmail,
      isAuthenticated: true,
    });

    try {
      await AsyncStorage.setItem(
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

  logout: async () => {
    set({
      accessToken: null,
      refreshToken: null,
      userId: null,
      userEmail: null,
      isAuthenticated: false,
    });

    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to remove auth from storage:', error);
    }
  },

  restoreFromStorage: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
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
