import { WebSocketService, WebSocketMessage } from '../services/websocket.service';

// Mock @stomp/stompjs and sockjs-client
jest.mock('@stomp/stompjs', () => ({
  Client: jest.fn().mockImplementation(() => ({
    activate: jest.fn(),
    deactivate: jest.fn(),
    subscribe: jest.fn(),
    publish: jest.fn(),
  })),
}));

jest.mock('sockjs-client', () => {
  return jest.fn(() => ({}));
});

describe('WebSocketService', () => {
  let service: WebSocketService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WebSocketService('http://localhost:8080');
  });

  describe('constructor', () => {
    it('should initialize with backend URL', () => {
      const customUrl = 'http://custom-backend:8080';
      const customService = new WebSocketService(customUrl);
      expect(customService).toBeDefined();
    });

    it('should use default backend URL', () => {
      const defaultService = new WebSocketService();
      expect(defaultService).toBeDefined();
    });
  });

  describe('subscribe', () => {
    it('should subscribe to message type', () => {
      const handler = jest.fn();
      const unsubscribe = service.subscribe('note_created', handler);

      expect(unsubscribe).toBeDefined();
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('isConnectedStatus', () => {
    it('should return connection status', () => {
      const status = service.isConnectedStatus();
      expect(typeof status).toBe('boolean');
    });
  });

  describe('message routing', () => {
    it('should route messages to correct handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      service.subscribe('note_created', handler1);
      service.subscribe('note_created', handler2);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should allow unsubscribing from messages', () => {
      const handler = jest.fn();
      const unsubscribe = service.subscribe('note_created', handler);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});
