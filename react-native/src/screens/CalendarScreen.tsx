import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuthStore } from '../store/auth';
import { useNotesStore } from '../store/notes';
import { NotesService } from '../services/notes.service';
import { LocalStorageService } from '../services/local-storage.service';
import { Note } from '../types/Note';

export const CalendarScreen: React.FC<any> = ({ navigation, route }) => {
  const { userId } = useAuthStore();
  const { notes, addNote, updateNote, deleteNote } = useNotesStore();
  const [note, setNote] = useState<Partial<Note>>({
    title: '',
    content: '',
    date: new Date(),
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const noteId = route?.params?.noteId;

  useEffect(() => {
    if (noteId) {
      loadNote(noteId);
    }
  }, [noteId]);

  const loadNote = (id: string) => {
    const found = notes.find((n) => n.id === id);
    if (found) {
      setNote(found);
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setNote({ ...note, date: selectedDate });
    }
  };

  const handleSaveNote = async () => {
    if (!note.title || !note.content || !userId) {
      Alert.alert('Validation Error', 'Please fill in all fields');
      return;
    }

    try {
      setLoading(true);

      const noteData = {
        id: note.id || `note-${Date.now()}`,
        userId,
        title: note.title,
        content: note.content,
        date: note.date || new Date(),
        createdAt: note.createdAt || new Date(),
        updatedAt: new Date(),
        synced: false,
      };

      if (note.id) {
        // Update existing note
        await NotesService.updateNote(note.id, noteData);
        updateNote(noteData);
      } else {
        // Create new note
        try {
          // Try to sync with backend first
          const response = await NotesService.createNote(noteData);
          noteData.id = response.id;
          noteData.synced = true;
        } catch (error) {
          // Save locally if sync fails
          console.warn('Failed to sync note, saving locally:', error);
          noteData.synced = false;
        }

        // Save locally
        await LocalStorageService.saveNote(noteData);
        addNote(noteData);
      }

      Alert.alert('Success', 'Note saved successfully');
      navigation.goBack();
    } catch (error) {
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = () => {
    if (!note.id) return;

    Alert.alert('Delete Note', 'Are you sure you want to delete this note?', [
      { text: 'Cancel', onPress: () => {}, style: 'cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            setLoading(true);
            await NotesService.deleteNote(note.id!);
            deleteNote(note.id!);
            Alert.alert('Success', 'Note deleted successfully');
            navigation.goBack();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete note');
          } finally {
            setLoading(false);
          }
        },
        style: 'destructive',
      },
    ]);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerButton}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {note.id ? 'Edit Note' : 'New Note'}
        </Text>
        {note.id && (
          <TouchableOpacity onPress={handleDeleteNote} disabled={loading}>
            <Text style={styles.deleteButton}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="Note title"
            value={note.title}
            onChangeText={(text) => setNote({ ...note, title: text })}
            editable={!loading}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Date</Text>
          <TouchableOpacity
            style={styles.dateButton}
            onPress={() => setShowDatePicker(true)}
            disabled={loading}
          >
            <Text style={styles.dateButtonText}>
              {note.date?.toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={note.date || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
          />
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Content</Text>
          <TextInput
            style={[styles.input, styles.contentInput]}
            placeholder="Write your note here..."
            value={note.content}
            onChangeText={(text) => setNote({ ...note, content: text })}
            multiline
            numberOfLines={8}
            textAlignVertical="top"
            editable={!loading}
          />
        </View>

        {note.synced === false && (
          <View style={styles.syncStatus}>
            <Text style={styles.syncText}>
              Pending sync (offline)
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSaveNote}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save Note</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  headerButton: {
    color: '#4285F4',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#333',
  },
  contentInput: {
    height: 150,
  },
  dateButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
  },
  dateButtonText: {
    fontSize: 14,
    color: '#333',
  },
  syncStatus: {
    backgroundColor: '#FFF3CD',
    borderWidth: 1,
    borderColor: '#FFC107',
    borderRadius: 8,
    padding: 12,
    marginVertical: 16,
  },
  syncText: {
    fontSize: 12,
    color: '#856404',
  },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 24,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  saveButton: {
    backgroundColor: '#4285F4',
    paddingVertical: 14,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
