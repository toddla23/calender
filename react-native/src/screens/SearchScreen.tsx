import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Note } from '@calendar/sync-core';
import { NoteRow } from '../components/NoteRow';
import { theme } from '../lib/colors';
import type { RootStackParamList } from '../navigation/types';
import { useAppStore } from '../state/app-store';
import { useRuntime } from '../state/runtime-context';

type Props = NativeStackScreenProps<RootStackParamList, 'Search'>;

export function SearchScreen({ navigation }: Props) {
  const rt = useRuntime();
  const version = useAppStore((s) => s.notesVersion);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Note[]>([]);

  // 로컬 SQLite 검색 (삭제된 메모 제외)
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      rt.store
        .searchNotes(q)
        .then((r) => !cancelled && setResults(r))
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [rt, query, version]);

  return (
    <View style={styles.flex}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder="메모 내용 검색"
        autoFocus
        returnKeyType="search"
      />
      <FlatList
        data={results}
        keyExtractor={(n) => n.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <NoteRow
            note={item}
            showDate
            onPress={() => navigation.navigate('NoteEdit', { date: item.date, noteId: item.id })}
            onRestore={() => {}}
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{query.trim() ? '검색 결과가 없습니다' : '검색어를 입력하세요'}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  input: { margin: 12, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12, fontSize: 16 },
  empty: { textAlign: 'center', color: theme.subtext, marginTop: 48 },
});
