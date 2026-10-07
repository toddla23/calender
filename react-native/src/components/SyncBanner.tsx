import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../lib/colors';
import { useAppStore } from '../state/app-store';

/** 동기화 상태 배너: offline / error / syncing(최초 Pull 진행률) / 서버 시계 경고 */
export function SyncBanner() {
  const status = useAppStore((s) => s.syncStatus);
  const pull = useAppStore((s) => s.pullReceived);
  const warning = useAppStore((s) => s.warning);
  const unsynced = useAppStore((s) => s.unsynced);

  const items: Array<{ key: string; text: string; bg: string }> = [];
  if (status === 'offline') {
    items.push({
      key: 'offline',
      bg: theme.warnBg,
      text: `오프라인입니다. 변경 사항은 기기에 저장되고 연결되면 자동으로 동기화됩니다${unsynced > 0 ? ` (대기 ${unsynced}건)` : ''}`,
    });
  } else if (status === 'error') {
    items.push({ key: 'error', bg: theme.errorBg, text: '동기화 중 문제가 발생했습니다. 잠시 후 자동으로 다시 시도합니다' });
  } else if (status === 'syncing' && pull !== null) {
    items.push({ key: 'pull', bg: theme.infoBg, text: `서버에서 메모를 받는 중... ${pull}건` });
  } else if (status === 'syncing') {
    items.push({ key: 'sync', bg: theme.infoBg, text: '동기화 중...' });
  }
  if (warning) items.push({ key: 'warn', bg: theme.warnBg, text: `서버 시계 경고: ${warning}` });

  if (items.length === 0) return null;
  return (
    <View>
      {items.map((i) => (
        <View key={i.key} style={[styles.bar, { backgroundColor: i.bg }]}>
          <Text style={styles.text}>{i.text}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 16, paddingVertical: 8 },
  text: { fontSize: 13, color: theme.text },
});
