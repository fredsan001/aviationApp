import React, { useEffect, useState } from 'react';
import { Stack, router, usePathname, useRootNavigationState, Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppStore } from '../src/store/appStore';

export default function RootLayout() {
  const loadStoredData = useAppStore(state => state.loadStoredData);
  const { isAdmin, accessCode } = useAppStore();
  const pathname = usePathname();
  const navigationState = useRootNavigationState();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      await loadStoredData();
      setIsLoading(false);
    };
    init();
  }, []);

  // Redirect to home if not authenticated and trying to access protected routes
  useEffect(() => {
    if (isLoading) return; // Wait for data to load
    if (!navigationState?.key) return; // Wait for navigation to be ready
    
    const isProtectedRoute = pathname.startsWith('/student') || pathname.startsWith('/admin');
    const isAuthenticated = isAdmin || accessCode;
    
    if (isProtectedRoute && !isAuthenticated) {
      // User tried to access protected route without auth
      router.replace('/');
    }
  }, [pathname, isAdmin, accessCode, navigationState?.key, isLoading]);

  if (isLoading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#121212',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: '600',
          },
          contentStyle: {
            backgroundColor: '#121212',
          },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="student" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
