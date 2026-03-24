import React, { useState, useRef } from 'react';
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
  Keyboard,
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
  
  const accessCodeRef = useRef<TextInput>(null);
  const adminPasswordRef = useRef<TextInput>(null);
  
  const { setAdmin, setAccessCode: storeAccessCode } = useAppStore();

  const handleStudentLogin = async () => {
    Keyboard.dismiss();
    if (!accessCode.trim()) {
      Alert.alert('Error', 'Por favor ingresa tu código de acceso');
      return;
    }
    
    setLoading(true);
    try {
      const result = await apiService.verifyAccessCode(accessCode.trim().toUpperCase());
      storeAccessCode(accessCode.trim().toUpperCase(), result.client_name);
      router.replace('/student');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Código de acceso inválido');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async () => {
    Keyboard.dismiss();
    if (!adminPassword.trim()) {
      Alert.alert('Error', 'Por favor ingresa la contraseña de administrador');
      return;
    }
    
    setLoading(true);
    try {
      await apiService.adminLogin(adminPassword);
      setAdmin(true);
      router.replace('/admin');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Contraseña inválida');
    } finally {
      setLoading(false);
    }
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Ionicons name="airplane" size={56} color="#2196F3" />
            </View>
            <Text style={styles.title}>AeroEnglish</Text>
            <Text style={styles.subtitle}>Comunicaciones Aeronáuticas</Text>
          </View>

          <View style={styles.content}>
            {!showAdminLogin ? (
              <>
                <View style={styles.inputContainer}>
                  <Ionicons name="key-outline" size={22} color="#666" style={styles.inputIcon} />
                  <TextInput
                    ref={accessCodeRef}
                    style={styles.input}
                    placeholder="Código de Acceso"
                    placeholderTextColor="#666"
                    value={accessCode}
                    onChangeText={setAccessCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={12}
                    returnKeyType="done"
                    onSubmitEditing={handleStudentLogin}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, styles.primaryButton]}
                  onPress={handleStudentLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="play" size={22} color="#fff" />
                      <Text style={styles.buttonText}>Iniciar</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.adminLink}
                  onPress={() => {
                    setShowAdminLogin(true);
                    setTimeout(() => adminPasswordRef.current?.focus(), 300);
                  }}
                >
                  <Ionicons name="settings-outline" size={16} color="#666" />
                  <Text style={styles.adminLinkText}>Acceso Administrador</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={22} color="#666" style={styles.inputIcon} />
                  <TextInput
                    ref={adminPasswordRef}
                    style={styles.input}
                    placeholder="Contraseña Admin"
                    placeholderTextColor="#666"
                    value={adminPassword}
                    onChangeText={(text) => setAdminPassword(text)}
                    secureTextEntry={true}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    textContentType="none"
                    returnKeyType="done"
                    onSubmitEditing={handleAdminLogin}
                    editable={true}
                    selectTextOnFocus={true}
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, styles.adminButton]}
                  onPress={handleAdminLogin}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="shield-checkmark" size={22} color="#fff" />
                      <Text style={styles.buttonText}>Entrar como Admin</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.adminLink}
                  onPress={() => {
                    setShowAdminLogin(false);
                    setAdminPassword('');
                  }}
                >
                  <Ionicons name="arrow-back" size={16} color="#666" />
                  <Text style={styles.adminLinkText}>Volver al Login Estudiante</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Aprende comunicaciones aeronáuticas mediante repetición</Text>
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
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 100,
    height: 100,
    backgroundColor: '#1E1E1E',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
  },
  content: {
    marginBottom: 40,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 16,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    paddingVertical: 16,
    height: 56,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
    minHeight: 56,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
  },
  adminButton: {
    backgroundColor: '#FF9800',
  },
  buttonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  adminLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 8,
    padding: 10,
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
    fontSize: 13,
    textAlign: 'center',
  },
});
