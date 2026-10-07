import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { RootStackParamList } from './src/navigation/types';
import { createNativeRuntime } from './src/runtime/native';
import type { AppRuntime } from './src/runtime/runtime';
import { LoginScreen } from './src/screens/LoginScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { DayDetailScreen } from './src/screens/DayDetailScreen';
import { NoteEditScreen } from './src/screens/NoteEditScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { bindRuntimeToStore, useAppStore } from './src/state/app-store';
import { RuntimeProvider } from './src/state/runtime-context';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [runtime, setRuntime] = useState<AppRuntime | null>(null);
  const phase = useAppStore((s) => s.phase);
  const fatal = useAppStore((s) => s.fatalMessage);
  const user = useAppStore((s) => s.user);
  const status = useAppStore((s) => s.syncStatus);

  useEffect(() => {
    let off: (() => void) | undefined;
    (async () => {
      try {
        const rt = await createNativeRuntime();
        off = bindRuntimeToStore(rt);
        await rt.init(); // 저장된 로그인 세션 복원 (있으면 동기화/실시간 시작)
        setRuntime(rt);
        useAppStore.setState({ phase: 'ready' });
      } catch (e: any) {
        useAppStore.setState({ phase: 'fatal', fatalMessage: String(e?.message ?? e) });
      }
    })();
    return () => off?.();
  }, []);

  if (phase === 'fatal') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 16 }}>앱을 시작하지 못했습니다: {fatal}</Text>
      </View>
    );
  }
  if (!runtime || phase !== 'ready') {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  // 로그아웃 상태이거나 세션 만료(auth-expired)면 로그인 화면으로 유도
  const needsLogin = !user || status === 'auth-expired';

  return (
    <SafeAreaProvider>
      <RuntimeProvider runtime={runtime}>
        <NavigationContainer>
          <StatusBar style="dark" />
          <Stack.Navigator>
            {needsLogin ? (
              <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            ) : (
              <>
                <Stack.Screen name="Calendar" component={CalendarScreen} />
                <Stack.Screen name="DayDetail" component={DayDetailScreen} />
                <Stack.Screen name="NoteEdit" component={NoteEditScreen} />
                <Stack.Screen name="Search" component={SearchScreen} options={{ title: '검색' }} />
                <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: '설정' }} />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </RuntimeProvider>
    </SafeAreaProvider>
  );
}
