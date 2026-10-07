import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Note } from '@calendar/sync-core';
import { NOTE_COLORS, noteDotColor, theme } from '../lib/colors';
import { addDays, addMonths, formatKoreanDate } from '../lib/date';
import type { RootStackParamList } from '../navigation/types';
import { useRuntime } from '../state/runtime-context';

type Props = NativeStackScreenProps<RootStackParamList, 'NoteEdit'>;

export function NoteEditScreen({ navigation, route }: Props) {
  const rt = useRuntime();
  const { noteId } = route.params;
  const [date, setDate] = useState(route.params.date);
  const [content, setContent] = useState('');
  const [color, setColor] = useState('');
  const [existing, setExisting] = useState<Note | null>(null);
  const [loaded, setLoaded] = useState(!noteId);

  useLayoutEffect(() => {
    navigation.setOptions({ title: noteId ? '메모 수정' : '새 메모' });
  }, [navigation, noteId]);

  useEffect(() => {
    if (!noteId) return;
    rt.store.getNote(noteId).then((n) => {
      if (n) {
        setExisting(n);
        setDate(n.date);
        setContent(n.content);
        setColor(n.color);
      }
      setLoaded(true);
    });
  }, [rt, noteId]);

  // 삭제된 메모는 수정할 수 없고 복구만 가능
  const deleted = existing?.deleted ?? false;

  const save = async () => {
    if (!content.trim()) {
      Alert.alert('내용을 입력해 주세요');
      return;
    }
    try {
      if (noteId) await rt.notes.update(noteId, { date, content, color });
      else await rt.notes.create({ date, content, color });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('저장 실패', String(e?.message ?? e));
    }
  };

  const remove = () => {
    if (!noteId) return;
    Alert.alert('메모 삭제', '이 메모를 삭제할까요? 삭제 후에도 날짜 상세에서 복구할 수 있습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await rt.notes.delete(noteId);
          navigation.goBack();
        },
      },
    ]);
  };

  const restore = async () => {
    if (!noteId) return;
    await rt.notes.restore(noteId);
    navigation.goBack();
  };

  if (!loaded) return <View style={styles.flex} />;

  if (deleted) {
    return (
      <View style={[styles.flex, styles.center]}>
        <Text style={styles.deletedText}>삭제된 메모입니다. 수정하려면 먼저 복구하세요.</Text>
        <Text style={styles.preview}>{content}</Text>
        <Pressable style={styles.primary} onPress={restore}>
          <Text style={styles.primaryText}>복구</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>날짜</Text>
        <Text style={styles.dateText}>{formatKoreanDate(date)}</Text>
        <View style={styles.dateButtons}>
          <DateBtn label="-1달" onPress={() => setDate(addMonths(date, -1))} />
          <DateBtn label="-1일" onPress={() => setDate(addDays(date, -1))} />
          <DateBtn label="+1일" onPress={() => setDate(addDays(date, 1))} />
          <DateBtn label="+1달" onPress={() => setDate(addMonths(date, 1))} />
        </View>

        <Text style={styles.label}>내용</Text>
        <TextInput
          style={styles.input}
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus={!noteId}
          placeholder="메모를 입력하세요"
          textAlignVertical="top"
          maxLength={20000}
        />

        <Text style={styles.label}>색상</Text>
        <View style={styles.palette}>
          {NOTE_COLORS.map((c) => (
            <Pressable
              key={c.name}
              onPress={() => setColor(c.value)}
              accessibilityLabel={`색상 ${c.name}`}
              style={[styles.swatch, { backgroundColor: noteDotColor(c.value) }, color === c.value && styles.swatchSelected]}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        {!!noteId && (
          <Pressable style={styles.danger} onPress={remove}>
            <Text style={styles.dangerText}>삭제</Text>
          </Pressable>
        )}
        <Pressable style={[styles.primary, styles.grow]} onPress={save}>
          <Text style={styles.primaryText}>저장</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const DateBtn = ({ label, onPress }: { label: string; onPress(): void }) => (
  <Pressable style={styles.dateBtn} onPress={onPress}>
    <Text style={styles.dateBtnText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  center: { justifyContent: 'center', padding: 24 },
  container: { padding: 16 },
  label: { marginTop: 16, marginBottom: 6, color: theme.subtext, fontSize: 13 },
  dateText: { fontSize: 18, fontWeight: '600', color: theme.text },
  dateButtons: { flexDirection: 'row', gap: 8, marginTop: 8 },
  dateBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: theme.surface, alignItems: 'center' },
  dateBtnText: { color: theme.text, fontWeight: '600' },
  input: { minHeight: 160, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12, fontSize: 16 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: theme.text },
  bottom: { flexDirection: 'row', gap: 12, padding: 12, paddingBottom: 20 },
  grow: { flex: 1 },
  primary: { padding: 16, borderRadius: 14, backgroundColor: theme.primary, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  danger: { paddingHorizontal: 20, justifyContent: 'center', borderRadius: 14, backgroundColor: theme.errorBg },
  dangerText: { color: theme.danger, fontWeight: '700' },
  deletedText: { color: theme.subtext, textAlign: 'center', marginBottom: 12 },
  preview: { textAlign: 'center', opacity: 0.5, marginBottom: 24, fontSize: 16, textDecorationLine: 'line-through' },
});
