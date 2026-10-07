import React, { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { Note } from '@calendar/sync-core';
import { SyncBanner } from '../components/SyncBanner';
import { noteDotColor, theme } from '../lib/colors';
import {
  WEEKDAYS_KO,
  buildMonthGrid,
  formatKoreanMonth,
  gridRange,
  monthOf,
  shiftMonth,
  todayString,
  yearsInGrid,
  type YearMonth,
} from '../lib/date';
import type { RootStackParamList } from '../navigation/types';
import { useHolidayMap, useNotesBetween } from '../state/runtime-context';

type Props = NativeStackScreenProps<RootStackParamList, 'Calendar'>;

export function CalendarScreen({ navigation }: Props) {
  const [ym, setYm] = useState<YearMonth>(() => monthOf(todayString()));
  const today = todayString();
  const grid = useMemo(() => buildMonthGrid(ym), [ym]);
  const range = useMemo(() => gridRange(ym), [ym]);
  const years = useMemo(() => yearsInGrid(ym), [ym]);
  const notes = useNotesBetween(range.from, range.to);
  const holidays = useHolidayMap(years);

  const byDate = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of notes) {
      const arr = m.get(n.date);
      if (arr) arr.push(n);
      else m.set(n.date, [n]);
    }
    return m;
  }, [notes]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '캘린더',
      headerRight: () => (
        <View style={styles.headerRight}>
          <Pressable onPress={() => navigation.navigate('Search')} hitSlop={10}>
            <Text style={styles.headerBtn}>검색</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate('Settings')} hitSlop={10}>
            <Text style={styles.headerBtn}>설정</Text>
          </Pressable>
        </View>
      ),
    });
  }, [navigation]);

  return (
    <View style={styles.flex}>
      <SyncBanner />
      <View style={styles.monthBar}>
        <Pressable style={styles.navBtn} onPress={() => setYm(shiftMonth(ym, -1))} accessibilityLabel="이전 달">
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.monthTitle}>{formatKoreanMonth(ym)}</Text>
        <Pressable style={styles.navBtn} onPress={() => setYm(shiftMonth(ym, 1))} accessibilityLabel="다음 달">
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS_KO.map((w, i) => (
          <Text key={w} style={[styles.weekday, i === 0 && styles.sun, i === 6 && styles.sat]}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {grid.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((cell) => {
              const holiday = holidays.get(cell.date);
              const list = byDate.get(cell.date) ?? [];
              const colors = Array.from(new Set(list.map((n) => noteDotColor(n.color)))).slice(0, 4);
              const red = cell.weekday === 0 || !!holiday;
              const day = Number(cell.date.slice(8));
              return (
                <Pressable
                  key={cell.date}
                  style={[styles.cell, cell.date === today && styles.todayCell]}
                  onPress={() => navigation.navigate('DayDetail', { date: cell.date })}
                >
                  <Text
                    style={[
                      styles.day,
                      red ? styles.sun : cell.weekday === 6 ? styles.sat : null,
                      !cell.inMonth && styles.outMonth,
                    ]}
                  >
                    {day}
                  </Text>
                  {!!holiday && (
                    <Text style={[styles.holiday, !cell.inMonth && styles.outMonth]} numberOfLines={1}>
                      {holiday}
                    </Text>
                  )}
                  <View style={styles.dots}>
                    {colors.map((c) => (
                      <View key={c} style={[styles.dot, { backgroundColor: c }]} />
                    ))}
                    {list.length > colors.length && <Text style={styles.more}>+</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.bottom}>
        <Pressable style={styles.todayBtn} onPress={() => setYm(monthOf(today))}>
          <Text style={styles.todayText}>오늘</Text>
        </Pressable>
        <Pressable
          style={styles.addBtn}
          onPress={() => navigation.navigate('NoteEdit', { date: today })}
          accessibilityLabel="오늘 메모 추가"
        >
          <Text style={styles.addText}>+ 메모</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  headerRight: { flexDirection: 'row', gap: 16 },
  headerBtn: { color: theme.primary, fontSize: 16 },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8 },
  navBtn: { width: 56, height: 44, alignItems: 'center', justifyContent: 'center' },
  navText: { fontSize: 30, color: theme.text },
  monthTitle: { fontSize: 20, fontWeight: '700', color: theme.text },
  weekRow: { flexDirection: 'row', paddingHorizontal: 4 },
  weekday: { flex: 1, textAlign: 'center', paddingVertical: 6, color: theme.subtext, fontSize: 13 },
  grid: { flex: 1, paddingHorizontal: 4 },
  row: { flex: 1, flexDirection: 'row' },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
  },
  todayCell: { backgroundColor: theme.infoBg },
  day: { fontSize: 15, color: theme.text },
  sun: { color: theme.sunday },
  sat: { color: theme.saturday },
  outMonth: { opacity: 0.35 },
  holiday: { fontSize: 9, color: theme.holiday, maxWidth: '100%' },
  dots: { flexDirection: 'row', marginTop: 3, alignItems: 'center', gap: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  more: { fontSize: 9, color: theme.subtext },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, paddingBottom: 20 },
  todayBtn: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 24, backgroundColor: theme.surface },
  todayText: { fontWeight: '600', color: theme.text },
  addBtn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 24, backgroundColor: theme.primary },
  addText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
