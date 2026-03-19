import React from 'react';
import { Stack } from 'expo-router';

export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: '#121212',
        },
        headerTintColor: '#FF9800',
        headerTitleStyle: {
          fontWeight: '600',
        },
        contentStyle: {
          backgroundColor: '#121212',
        },
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          title: 'Admin Dashboard',
          headerShown: true,
        }} 
      />
      <Stack.Screen 
        name="videos" 
        options={{ 
          title: 'Manage Videos',
        }} 
      />
      <Stack.Screen 
        name="upload" 
        options={{ 
          title: 'Upload Video',
        }} 
      />
      <Stack.Screen 
        name="codes" 
        options={{ 
          title: 'Access Codes',
        }} 
      />
      <Stack.Screen 
        name="categories" 
        options={{ 
          title: 'Categories',
        }} 
      />
      <Stack.Screen 
        name="edit-video" 
        options={{ 
          title: 'Edit Video',
        }} 
      />
    </Stack>
  );
}
