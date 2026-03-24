import React from 'react';
import { Stack } from 'expo-router';

export default function StudentLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#121212',
        },
        headerTintColor: '#2196F3',
        headerTitleStyle: {
          fontWeight: '600',
        },
        contentStyle: {
          backgroundColor: '#121212',
        },
      }}
    >
      <Stack.Screen 
        name="(tabs)" 
        options={{ 
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="player" 
        options={{ 
          title: 'Video Player',
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="favorites" 
        options={{ 
          title: 'Favoritos',
        }} 
      />
    </Stack>
  );
}
