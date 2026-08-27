import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useAuthStore } from '../store/auth';
import { AuthService } from '../services/auth.service';

export const LoginScreen: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuthStore();

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const response = await AuthService.loginWithGoogle();

      if (response.accessToken && response.userId) {
        await login(
          response.accessToken,
          response.refreshToken || '',
          response.userId,
          response.userEmail || ''
        );
      }
    } catch (error) {
      Alert.alert('Login Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleNaverLogin = async () => {
    try {
      setLoading(true);
      const response = await AuthService.loginWithNaver();

      if (response.accessToken && response.userId) {
        await login(
          response.accessToken,
          response.refreshToken || '',
          response.userId,
          response.userEmail || ''
        );
      }
    } catch (error) {
      Alert.alert('Login Failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Calendar App</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Sign in with Google</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.naverButton}
          onPress={handleNaverLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>Sign in with Naver</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '80%',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 40,
  },
  googleButton: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: '#4285F4',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  naverButton: {
    width: '100%',
    paddingVertical: 14,
    backgroundColor: '#2DB400',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
