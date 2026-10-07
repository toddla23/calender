import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { googleSignOut } from '../auth/google';
import { SyncBanner } from '../components/SyncBanner';
import { theme } from '../lib/colors';
import { InvalidServerUrlError } from '../lib/url';
import { useAppStore } from '../state/app-store';
import { useRuntime } from '../state/runtime-context';

const STATUS_LABEL = {
  idle: '정상 (동기화 완료)',
  syncing: '동기화 중',
  offline: '오프라인',
  error: '오류 (자동 재시도 중)',
  'auth-expired': '로그인 만료',
} as const;

export function SettingsScreen() {
  const rt = useRuntime();
  const user = useAppStore((s) => s.user);
  const status = useAppStore((s) => s.syncStatus);
  const unsynced = useAppStore((s) => s.unsynced);
  const [serverUrl, setServerUrl] = useState(rt.getServerUrl());
  const [syncing, setSyncing] = useState(false);

  const saveUrl = async () => {
    try {
      const changed = serverUrl.trim() !== rt.getServerUrl();
      const apply = async () => {
        const url = await rt.setServerUrl(serverUrl);
        setServerUrl(url);
        // 로그인 상태에서 주소를 바꾸면 로그아웃되어 로그인 화면으로 이동한다
      };
      if (changed && user) {
        Alert.alert('서버 주소 변경', '다른 서버의 데이터와 섞이지 않도록 로그아웃되고 이 기기의 메모 사본이 삭제됩니다. 계속할까요?', [
          { text: '취소', style: 'cancel' },
          { text: '변경', style: 'destructive', onPress: apply },
        ]);
      } else {
        await apply();
      }
    } catch (e) {
      Alert.alert('저장 실패', e instanceof InvalidServerUrlError ? e.message : String(e));
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      await rt.syncNow();
    } finally {
      setSyncing(false);
    }
  };

  const logout = () => {
    const warn =
      unsynced > 0
        ? `서버에 반영되지 않은 메모 ${unsynced}건이 있습니다. 로그아웃하면 이 기기의 사본과 함께 사라집니다.`
        : '이 기기에 저장된 메모 사본이 삭제됩니다 (서버의 데이터는 유지됩니다).';
    Alert.alert('로그아웃', warn, [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await rt.logout();
          await googleSignOut();
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <SyncBanner />
      <Text style={styles.section}>계정</Text>
      <Text style={styles.value}>{user?.email ?? '-'}</Text>
      <Pressable style={styles.danger} onPress={logout}>
        <Text style={styles.dangerText}>로그아웃</Text>
      </Pressable>

      <Text style={styles.section}>동기화</Text>
      <Text style={styles.value}>상태: {STATUS_LABEL[status]}</Text>
      <Text style={styles.value}>서버에 반영되지 않은 메모: {unsynced}건</Text>
      <Pressable style={[styles.button, syncing && styles.disabled]} disabled={syncing} onPress={syncNow}>
        {syncing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>지금 동기화</Text>}
      </Pressable>

      <Text style={styles.section}>서버 주소</Text>
      <TextInput
        style={styles.input}
        value={serverUrl}
        onChangeText={setServerUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Pressable style={styles.secondary} onPress={saveUrl}>
        <Text style={styles.secondaryText}>주소 저장</Text>
      </Pressable>
      <Text style={styles.hint}>Android 에뮬레이터에서 PC의 서버는 http://10.0.2.2:8080 입니다. 운영 서버는 https 주소를 사용하세요.</Text>

      <Text style={styles.section}>기기 정보</Text>
      <Text style={styles.hint}>기기 ID: {rt.deviceId}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { paddingBottom: 48 },
  section: { marginTop: 24, marginBottom: 8, paddingHorizontal: 16, color: theme.subtext, fontSize: 13, fontWeight: '600' },
  value: { paddingHorizontal: 16, paddingVertical: 4, fontSize: 16, color: theme.text },
  input: { marginHorizontal: 16, borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, fontSize: 16 },
  hint: { paddingHorizontal: 16, marginTop: 6, color: theme.subtext, fontSize: 12 },
  button: { margin: 16, padding: 14, borderRadius: 12, backgroundColor: theme.primary, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  disabled: { opacity: 0.5 },
  secondary: { margin: 16, marginBottom: 0, padding: 12, borderRadius: 12, backgroundColor: theme.surface, alignItems: 'center' },
  secondaryText: { color: theme.text, fontWeight: '600' },
  danger: { margin: 16, padding: 12, borderRadius: 12, backgroundColor: theme.errorBg, alignItems: 'center' },
  dangerText: { color: theme.danger, fontWeight: '700' },
});
