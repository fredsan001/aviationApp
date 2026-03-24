import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../../../src/store/appStore';

export default function ProfileScreen() {
  const { clientName, accessCode, logout } = useAppStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Cerrar Sesión', 
          style: 'destructive',
          onPress: () => {
            logout();
            if (Platform.OS === 'web') {
              window.location.href = '/';
            } else {
              router.replace('/');
            }
          }
        },
      ]
    );
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const menuItems = [
    {
      icon: 'heart',
      title: 'Favoritos',
      subtitle: 'Videos guardados',
      color: '#F44336',
      onPress: () => router.push('/student/favorites'),
    },
    {
      icon: 'notifications',
      title: 'Notificaciones',
      subtitle: notificationsEnabled ? 'Activadas' : 'Desactivadas',
      color: '#FF9800',
      toggle: true,
      value: notificationsEnabled,
      onPress: () => setNotificationsEnabled(!notificationsEnabled),
    },
    {
      icon: 'help-circle',
      title: 'Ayuda',
      subtitle: 'Preguntas frecuentes',
      color: '#2196F3',
      onPress: () => Alert.alert('Ayuda', 'Contacta a tu instructor para más información.'),
    },
    {
      icon: 'information-circle',
      title: 'Acerca de',
      subtitle: 'Versión 1.0.0',
      color: '#9C27B0',
      onPress: () => Alert.alert('AeroEnglish', 'Versión 1.0.0\n\nAplicación para el aprendizaje de comunicaciones aeronáuticas en inglés.'),
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        {/* Profile Header */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarContainer}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {clientName ? getInitials(clientName) : 'US'}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          </View>
          <Text style={styles.profileName}>{clientName || 'Usuario'}</Text>
          <View style={styles.codeContainer}>
            <Ionicons name="key" size={14} color="#888" />
            <Text style={styles.codeText}>{accessCode}</Text>
          </View>
        </View>

        {/* Stats Summary */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>Activo</Text>
            <Text style={styles.statLabel}>Estado</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>Estudiante</Text>
            <Text style={styles.statLabel}>Tipo de Cuenta</Text>
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={item.onPress}
              activeOpacity={0.7}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon as any} size={22} color={item.color} />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
              </View>
              {item.toggle ? (
                <View style={[
                  styles.toggleContainer,
                  item.value && styles.toggleContainerActive
                ]}>
                  <View style={[
                    styles.toggleCircle,
                    item.value && styles.toggleCircleActive
                  ]} />
                </View>
              ) : (
                <Ionicons name="chevron-forward" size={20} color="#666" />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#F44336" />
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </TouchableOpacity>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>AeroEnglish © 2024</Text>
          <Text style={styles.footerSubtext}>Comunicaciones Aeronáuticas</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    padding: 24,
    paddingTop: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  statusBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#121212',
  },
  profileName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  codeText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#333',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
  },
  menuContainer: {
    paddingHorizontal: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 2,
  },
  menuSubtitle: {
    fontSize: 13,
    color: '#888',
  },
  toggleContainer: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#333',
    padding: 2,
    justifyContent: 'center',
  },
  toggleContainerActive: {
    backgroundColor: '#4CAF50',
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#888',
  },
  toggleCircleActive: {
    backgroundColor: '#fff',
    alignSelf: 'flex-end',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    gap: 10,
  },
  logoutText: {
    color: '#F44336',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    padding: 24,
    marginTop: 8,
  },
  footerText: {
    color: '#666',
    fontSize: 14,
  },
  footerSubtext: {
    color: '#444',
    fontSize: 12,
    marginTop: 4,
  },
});
