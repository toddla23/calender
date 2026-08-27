import { SyncService } from '../services/sync.service';
import { LocalStorageService } from '../services/local-storage.service';
import { NotesService } from '../services/notes.service';
import NetInfo from '@react-native-community/netinfo';

jest.mock('../services/local-storage.service');
jest.mock('../services/notes.service');
jest.mock('@react-native-community/netinfo');
jest.mock('../store/notes', () => ({
  useNotesStore: {
    getState: () => ({
      notes: [],
      setNotes: jest.fn(),
    }),
  },
}));

describe('SyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SyncService.stopAutoSync();
  });

  afterEach(() => {
    SyncService.cleanup();
  });

  describe('initialize', () => {
    it('should set up network monitoring', async () => {
      const mockUnsubscribe = jest.fn();
      (NetInfo.addEventListener as jest.Mock).mockReturnValue(mockUnsubscribe);
      (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: true });

      await SyncService.initialize();

      expect(NetInfo.addEventListener).toHaveBeenCalled();
      expect(NetInfo.fetch).toHaveBeenCalled();
    });
  });

  describe('startAutoSync', () => {
    it('should set up auto sync interval', () => {
      const spy = jest.spyOn(global, 'setInterval');

      SyncService.startAutoSync(30000);

      expect(spy).toHaveBeenCalledWith(expect.any(Function), 30000);
      spy.mockRestore();
    });
  });

  describe('stopAutoSync', () => {
    it('should clear auto sync interval', () => {
      const spy = jest.spyOn(global, 'clearInterval');

      SyncService.startAutoSync(30000);
      SyncService.stopAutoSync();

      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });

  describe('isNetworkOnline', () => {
    it('should return network status', () => {
      const status = SyncService.isNetworkOnline();
      expect(typeof status).toBe('boolean');
    });
  });
});
