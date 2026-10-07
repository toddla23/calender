import React, { useLayoutEffect } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { NoteRow } from '../components/NoteRow';
import { SyncBanner } from '../components/SyncBanner';
import { theme } from '../lib/colors';
import { formatKoreanDate } from '../lib/date';
import type { RootStackParamList } from '../navigation/types';
import { useHolidayMap, useNotesBetween, useRuntime } from '../state/runtime-context';

type Props = NativeStackScreenProps<RootStackParamList, 'DayDetail'>;

export function DayDetailScreen({ navigation, route }: Props) {
  const { date } = route.params;
  const rt = useRuntime();
  const notes = useNotesBetween(date, date, true);
  const holidays = useHolidayMap([Number(date.slice(0, 4))]);
  const holiday = holidays.get(date);

  useLayoutEffect(() => {
    navigation.setOptions({ title: formatKoreanDate(date) });
  }, [navigation, date]);

  const restore = (id: string) => {
    rt.notes.restore(id).catch((e) => Alert.alert('복구 실패', String(e?.message ?? e)));
  };

  return (
    <View style={styles.flex}>
      <SyncBanner />
      {!!holiday && <Text style={styles.holiday}>{holiday}</Text>}
      <FlatList
        data={notes}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => (
          <NoteRow
            note={item}
            onPress={() => navigation.navigate('NoteEdit', { date, noteId: item.id })}
            onRestore={() => restore(item.id)}
          />
        )}
        ListEmptyComponent={<Text style={styles.empty}>이 날의 메모가 없습니다</Text>}
      />
      <View style={styles.bottom}>
        <Pressable style={styles.addBtn} onPress={() => navigation.navigate('NoteEdit', { date })}>
          <Text style={styles.addText}>+ 메모 추가</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  holiday: { color: theme.holiday, paddingHorizontal: 16, paddingVertical: 8, fontWeight: '600' },
  empty: { textAlign: 'center', color: theme.subtext, marginTop: 48 },
  bottom: { padding: 12, paddingBottom: 20 },
  addBtn: { padding: 16, borderRadius: 14, backgroundColor: theme.primary, alignItems: 'center' },
  addText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
