import React from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Note } from '../types/Note';

interface NoteListItemProps {
  note: Note;
  onPress: () => void;
  onDelete: () => void;
}

export const NoteListItem: React.FC<NoteListItemProps> = ({
  note,
  onPress,
  onDelete,
}) => {
  const formattedDate = note.date
    ? new Date(note.date).toLocaleDateString()
    : 'No date';

  const preview = note.content.substring(0, 60);
  const hasMore = note.content.length > 60;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {note.title}
          </Text>
          {note.synced === false && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingText}>pending</Text>
            </View>
          )}
        </View>

        <Text style={styles.date}>{formattedDate}</Text>

        <Text style={styles.preview} numberOfLines={2}>
          {preview}
          {hasMore ? '...' : ''}
        </Text>
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Text style={styles.deleteButtonText}>×</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    marginRight: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  pendingBadge: {
    backgroundColor: '#FFC107',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  pendingText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: 'bold',
  },
  date: {
    fontSize: 12,
    color: '#999',
    marginBottom: 6,
  },
  preview: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFE0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 24,
    color: '#FF6B6B',
    fontWeight: 'bold',
  },
});
