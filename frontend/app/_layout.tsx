import React, { useEffect } from 'react';
import { Stack, router, usePathname, useRootNavigationState } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { useAppStore } from '../src/store/appStore';

export default function RootLayout() {
  const loadStoredData = useAppStore(state => state.loadStoredData);
  const { isAdmin, accessCode } = useAppStore();
  const pathname = usePathname();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    loadStoredData();
  }, []);

  // Redirect to home if not authenticated and trying to access protected routes
  useEffect(() => {
    if (!navigationState?.key) return; // Wait for navigation to be ready
    
    const isProtectedRoute = pathname.startsWith('/student') || pathname.startsWith('/admin');
    const isAuthenticated = isAdmin || accessCode;
    
    if (isProtectedRoute && !isAuthenticated) {
      // User tried to access protected route without auth
      router.replace('/');
    }
  }, [pathname, isAdmin, accessCode, navigationState?.key]);

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
});
