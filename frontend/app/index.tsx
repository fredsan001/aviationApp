import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { apiService } from '../src/utils/api';

export default function HomeScreen() {
  const [accessCode, setAccessCode] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const { setAdmin, setAccessCode: storeAccessCode } = useAppStore();

  const handleStudentLogin = async () => {
    if (!accessCode.trim()) {
      Alert.alert('Error', 'Please enter your access code');
      return;
    }
    
    setLoading(true);
    try {
      const result = await apiService.verifyAccessCode(accessCode.trim().toUpperCase());
      storeAccessCode(accessCode.trim().toUpperCase(), result.client_name);
      router.replace('/student');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Invalid access code');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async () => {
    if (!adminPassword.trim()) {
      Alert.alert('Error', 'Please enter admin password');
      return;
    }
    
    setLoading(true);
    try {
      await apiService.adminLogin(adminPassword);
      setAdmin(true);
      router.replace('/admin');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Invalid admin password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="airplane" size={64} color="#2196F3" />
            </View>
            <Text style={styles.title}>AeroEnglish</Text>
            <Text style={styles.subtitle}>Aviation Communication Training</Text>
          </View>

          <View style={styles.content}>
            {!showAdminLogin ? (
              <>
                <View style={styles.inputContainer}>
                  <Ionicons name="key-outline" size={24} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter Access Code"
                    placeholderTextColor="#666"
                    value={accessCode}
                    onChangeText={setAccessCode}
                    autoCapitalize="characters"
                    maxLength={12}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleStudentLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="play" size={24} color="#fff" />
                      <Text style={styles.buttonText}>Start Learning</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.adminLink}
                  onPress={() => setShowAdminLogin(true)}
                >
                  <Ionicons name="settings-outline" size={18} color="#666" />
                  <Text style={styles.adminLinkText}>Admin Access</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={24} color="#666" style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Admin Password"
                    placeholderTextColor="#666"
                    value={adminPassword}
                    onChangeText={setAdminPassword}
                    secureTextEntry
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, styles.adminButton]}
                  onPress={handleAdminLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark" size={24} color="#fff" />
                      <Text style={styles.buttonText}>Admin Login</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.adminLink}
                  onPress={() => setShowAdminLogin(false)}
                >
                  <Ionicons name="arrow-back" size={18} color="#666" />
                  <Text style={styles.adminLinkText}>Back to Student Login</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Learn aviation communications through repetition</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoContainer: {
    width: 120,
    height: 120,
    backgroundColor: '#1E1E1E',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  content: {
    marginBottom: 48,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 16,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
  },
  adminButton: {
    backgroundColor: '#FF9800',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  adminLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    gap: 8,
  },
  adminLinkText: {
    color: '#666',
    fontSize: 14,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    color: '#555',
    fontSize: 14,
    textAlign: 'center',
  },
});
