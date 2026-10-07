import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getGoogleIdToken, GoogleSignInCancelled } from '../auth/google';
import { devLoginEnabled, isGoogleConfigured } from '../config/env';
import { theme } from '../lib/colors';
import { InvalidServerUrlError } from '../lib/url';
import { useAppStore } from '../state/app-store';
import { useRuntime } from '../state/runtime-context';

export function LoginScreen() {
  const rt = useRuntime();
  const status = useAppStore((s) => s.syncStatus);
  const user = useAppStore((s) => s.user);
  const expired = status === 'auth-expired';
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [serverUrl, setServerUrl] = useState(rt.getServerUrl());

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      // 서버 주소가 바뀌었으면 먼저 반영 (로그인 전이므로 로그아웃 부작용 없음)
      if (serverUrl.trim() !== rt.getServerUrl()) await rt.setServerUrl(serverUrl);
      await fn();
    } catch (e) {
      if (e instanceof GoogleSignInCancelled) return;
      const msg = e instanceof InvalidServerUrlError ? e.message : e instanceof Error ? e.message : '알 수 없는 오류';
      Alert.alert('로그인 실패', msg);
    } finally {
      setBusy(false);
    }
  };

  const googleReady = isGoogleConfigured();

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>내 캘린더</Text>
        {expired ? (
          <Text style={styles.expired}>
            로그인 세션이 만료되었습니다{user ? ` (${user.email})` : ''}. 다시 로그인하면 기기에 저장된 메모가 그대로 동기화됩니다.
          </Text>
        ) : (
          <Text style={styles.sub}>어디서든 같은 메모를 보고, 오프라인에서도 사용하세요</Text>
        )}

        <Pressable
          style={[styles.button, !googleReady && styles.disabled]}
          disabled={!googleReady || busy}
          onPress={() => run(async () => rt.loginWithGoogle(await getGoogleIdToken()))}
        >
          <Text style={styles.buttonText}>Google로 로그인</Text>
        </Pressable>
        {!googleReady && (
          <Text style={styles.hint}>
            Google 로그인이 설정되지 않았습니다. 빌드 시 GOOGLE_WEB_CLIENT_ID 환경변수를 지정해야 합니다 (README 참고).
          </Text>
        )}

        <Text style={styles.label}>서버 주소</Text>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="http://10.0.2.2:8080"
        />

        {devLoginEnabled() && (
          <View style={styles.devBox}>
            <Text style={styles.devTitle}>개발용 로그인 (개발 빌드 전용)</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="test@example.com"
            />
            <Pressable
              style={[styles.button, styles.secondary, (!email.trim() || busy) && styles.disabled]}
              disabled={!email.trim() || busy}
              onPress={() => run(() => rt.loginDev(email.trim()))}
            >
              <Text style={[styles.buttonText, styles.secondaryText]}>이메일로 개발 로그인</Text>
            </Pressable>
          </View>
        )}
        {busy && <ActivityIndicator style={{ marginTop: 16 }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 24, paddingTop: 96 },
  title: { fontSize: 32, fontWeight: '700', color: theme.text },
  sub: { marginTop: 8, marginBottom: 32, color: theme.subtext },
  expired: { marginTop: 8, marginBottom: 32, color: theme.danger },
  button: { backgroundColor: theme.primary, padding: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondary: { backgroundColor: theme.surface },
  secondaryText: { color: theme.text },
  disabled: { opacity: 0.4 },
  hint: { marginTop: 8, color: theme.subtext, fontSize: 12 },
  label: { marginTop: 28, marginBottom: 6, color: theme.subtext, fontSize: 13 },
  input: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 10 },
  devBox: { marginTop: 24, padding: 12, borderRadius: 12, backgroundColor: theme.surface },
  devTitle: { fontWeight: '600', marginBottom: 8, color: theme.text },
});
