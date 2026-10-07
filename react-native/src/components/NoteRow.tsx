import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Note } from '@calendar/sync-core';
import { noteDotColor, theme } from '../lib/colors';

interface Props {
  note: Note;
  showDate?: boolean;
  onPress(): void;
  onRestore(): void;
}

/** 메모 한 줄. 삭제된 메모는 흐리게 표시하고 "복구" 버튼만 제공한다 (수정 불가) */
export function NoteRow({ note, showDate, onPress, onRestore }: Props) {
  const deleted = note.deleted;
  return (
    <Pressable
      onPress={deleted ? undefined : onPress}
      style={[styles.row, deleted && styles.deletedRow]}
      accessibilityLabel={deleted ? '삭제된 메모' : '메모 수정'}
    >
      <View style={[styles.dot, { backgroundColor: noteDotColor(note.color) }]} />
      <View style={styles.body}>
        {showDate && <Text style={styles.date}>{note.date}</Text>}
        <Text style={[styles.content, deleted && styles.deletedText]} numberOfLines={3}>
          {note.content || '(내용 없음)'}
        </Text>
        {!note.synced && !deleted && <Text style={styles.pending}>동기화 대기 중</Text>}
        {deleted && <Text style={styles.pending}>삭제됨</Text>}
      </View>
      {deleted && (
        <Pressable style={styles.restore} onPress={onRestore} hitSlop={8}>
          <Text style={styles.restoreText}>복구</Text>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
    backgroundColor: theme.bg,
  },
  deletedRow: { opacity: 0.5 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  body: { flex: 1 },
  date: { fontSize: 12, color: theme.subtext, marginBottom: 2 },
  content: { fontSize: 16, color: theme.text },
  deletedText: { textDecorationLine: 'line-through' },
  pending: { fontSize: 11, color: theme.subtext, marginTop: 2 },
  restore: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: theme.primary,
    marginLeft: 8,
  },
  restoreText: { color: '#fff', fontWeight: '600' },
});
