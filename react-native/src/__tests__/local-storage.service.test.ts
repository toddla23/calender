import { LocalStorageService } from '../services/local-storage.service';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Note } from '../types/Note';

jest.mock('@react-native-async-storage/async-storage');

const mockNote: Note = {
  id: 'note-1',
  userId: 'user-1',
  title: 'Test Note',
  content: 'Test content',
  date: new Date('2024-01-15'),
  createdAt: new Date('2024-01-15'),
  updatedAt: new Date('2024-01-15'),
  synced: false,
};

describe('LocalStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveNote', () => {
    it('should save a new note', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await LocalStorageService.saveNote(mockNote);

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });

    it('should update an existing note', async () => {
      const storedNotes = JSON.stringify([mockNote]);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(storedNotes);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      const updatedNote = { ...mockNote, title: 'Updated Title' };
      await LocalStorageService.saveNote(updatedNote);

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('getAllNotes', () => {
    it('should return all stored notes', async () => {
      const notes = [mockNote];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(notes));

      const result = await LocalStorageService.getAllNotes();

      expect(result).toEqual(notes);
    });

    it('should return empty array if no notes are stored', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await LocalStorageService.getAllNotes();

      expect(result).toEqual([]);
    });
  });

  describe('deleteNote', () => {
    it('should delete a note by id', async () => {
      const storedNotes = JSON.stringify([mockNote]);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(storedNotes);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await LocalStorageService.deleteNote('note-1');

      expect(AsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('getPendingSyncNotes', () => {
    it('should return list of pending sync note ids', async () => {
      const pending = ['note-1', 'note-2'];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(pending));

      const result = await LocalStorageService.getPendingSyncNotes();

      expect(result).toEqual(pending);
    });

    it('should return empty array if no pending syncs', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await LocalStorageService.getPendingSyncNotes();

      expect(result).toEqual([]);
    });
  });
});
