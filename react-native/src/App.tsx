import React, { useEffect, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-native-stack/native-stack';
import { useAuthStore } from './store/auth';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { SyncService } from './services/sync.service';
import { useNotesStore } from './store/notes';

const Stack = createNativeStackNavigator();

export const App: React.FC = () => {
  const { isAuthenticated, restoreFromStorage, accessToken, userId } = useAuthStore();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    restoreFromStorage();
  }, [restoreFromStorage]);

  useEffect(() => {
    if (isAuthenticated && accessToken && userId) {
      // Initialize sync service
      SyncService.initialize();
      SyncService.startAutoSync();

      // Set auth credentials for WebSocket
      SyncService.setAuthCredentials(accessToken, userId);

      // Subscribe to remote changes
      unsubscribeRef.current = SyncService.onRemoteChange((data) => {
        console.log('Remote change received:', data);
        // Store automatically updates in handleRemoteNoteChange
      });
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      SyncService.stopAutoSync();
      SyncService.disconnectWebSocket();
    };
  }, [isAuthenticated, accessToken, userId]);

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Calendar" component={CalendarScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default App;
