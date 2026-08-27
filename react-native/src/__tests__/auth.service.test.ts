import { AuthService } from '../services/auth.service';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage');

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('should create an API client', () => {
      AuthService.initialize();
      const client = AuthService.getApiClient();
      expect(client).toBeDefined();
    });
  });

  describe('logout', () => {
    it('should remove stored tokens and user data', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

      await AuthService.logout();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('access_token');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('refresh_token');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user_id');
    });
  });

  describe('getApiClient', () => {
    it('should return the same client instance', () => {
      AuthService.initialize();
      const client1 = AuthService.getApiClient();
      const client2 = AuthService.getApiClient();
      expect(client1).toBe(client2);
    });

    it('should initialize client if not already done', () => {
      const client = AuthService.getApiClient();
      expect(client).toBeDefined();
    });
  });
});
