import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-native-stack/native-stack';
import { useAuthStore } from './store/auth';
import { LoginScreen } from './screens/LoginScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { SyncService } from './services/sync.service';

const Stack = createNativeStackNavigator();

export const App: React.FC = () => {
  const { isAuthenticated, restoreFromStorage } = useAuthStore();

  useEffect(() => {
    restoreFromStorage();
  }, [restoreFromStorage]);

  useEffect(() => {
    if (isAuthenticated) {
      SyncService.initialize();
      SyncService.startAutoSync();
    }

    return () => {
      SyncService.stopAutoSync();
    };
  }, [isAuthenticated]);

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
