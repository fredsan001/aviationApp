import React, { useState, useRef, useEffect } from 'react';
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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAppStore } from '../src/store/appStore';
import { apiService } from '../src/utils/api';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import * as Application from 'expo-application';
import * as SecureStore from 'expo-secure-store';

// Generate or retrieve a persistent device ID
async function getDeviceId(): Promise<string> {
  try {
    // Try to get existing device ID
    let deviceId = await SecureStore.getItemAsync('device_id');
    
    if (!deviceId) {
      // Generate a new unique ID
      if (Platform.OS === 'ios') {
        deviceId = await Application.getIosIdForVendorAsync() || '';
      } else if (Platform.OS === 'android') {
        deviceId = Application.getAndroidId() || '';
      }
      
      // Fallback to random ID if platform-specific ID not available
      if (!deviceId) {
        deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
      
      // Store for future use
      await SecureStore.setItemAsync('device_id', deviceId);
    }
    
    return deviceId;
  } catch (error) {
    // Fallback for web or if SecureStore fails
    return `web_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default function HomeScreen() {
  const [accessCode, setAccessCode] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoLogging, setAutoLogging] = useState(true); // Show loading while checking saved code
  const [introVideo, setIntroVideo] = useState<any>(null);
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [errorModal, setErrorModal] = useState<{visible: boolean; title: string; message: string}>({
    visible: false,
    title: '',
    message: ''
  });
  
  const accessCodeRef = useRef<TextInput>(null);
  const adminPasswordRef = useRef<TextInput>(null);
  
  const { setAdmin, setAccessCode: storeAccessCode } = useAppStore();
  
  // Helper function to show error modal (works on all platforms including web)
  const showErrorModal = (title: string, message: string) => {
    setErrorModal({ visible: true, title, message });
  };

  // Check for saved access code on app load
  useEffect(() => {
    loadIntroVideo();
    checkSavedAccessCode();
  }, []);

  const checkSavedAccessCode = async () => {
    try {
      let savedCode: string | null = null;
      
      if (Platform.OS === 'web') {
        savedCode = localStorage.getItem('saved_access_code');
      } else {
        savedCode = await SecureStore.getItemAsync('saved_access_code');
      }
      
      if (savedCode) {
        setAccessCode(savedCode);
        // Auto-login with saved code
        await handleAutoLogin(savedCode);
      } else {
        setAutoLogging(false);
      }
    } catch (error) {
      console.error('Error checking saved access code:', error);
      setAutoLogging(false);
    }
  };

  const saveAccessCode = async (code: string) => {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem('saved_access_code', code);
      } else {
        await SecureStore.setItemAsync('saved_access_code', code);
      }
    } catch (error) {
      console.error('Error saving access code:', error);
    }
  };

  const handleAutoLogin = async (savedCode: string) => {
    setLoading(true);
    try {
      const deviceId = await getDeviceId();
      const result = await apiService.verifyAccessCode(savedCode, deviceId);
      storeAccessCode(savedCode, result.client_name);
      router.replace('/student');
    } catch (error: any) {
      // If auto-login fails, clear saved code and show login screen
      console.log('Auto-login failed, showing login screen');
      if (Platform.OS === 'web') {
        localStorage.removeItem('saved_access_code');
      } else {
        await SecureStore.deleteItemAsync('saved_access_code');
      }
      setAccessCode('');
      setAutoLogging(false);
    } finally {
      setLoading(false);
    }
  };

  const loadIntroVideo = async () => {
    try {
      const result = await apiService.getIntroVideo();
      if (result.video) {
        setIntroVideo(result.video);
      }
    } catch (error) {
      console.error('Error loading intro video:', error);
    }
  };

  const handleStudentLogin = async () => {
    Keyboard.dismiss();
    if (!accessCode.trim()) {
      showErrorModal('Error', 'Por favor ingresa tu código de acceso');
      return;
    }
    
    setLoading(true);
    try {
      // Get device ID for single-device enforcement
      const deviceId = await getDeviceId();
      
      const result = await apiService.verifyAccessCode(accessCode.trim().toUpperCase(), deviceId);
      
      // Save the access code for future logins
      await saveAccessCode(accessCode.trim().toUpperCase());
      
      storeAccessCode(accessCode.trim().toUpperCase(), result.client_name);
      router.replace('/student');
    } catch (error: any) {
      const detail = error.response?.data?.detail || 'Código de acceso inválido';
      
      // Check if it's a device blocked error
      if (detail.includes('DEVICE_BLOCKED')) {
        showErrorModal(
          '⚠️ Dispositivo Bloqueado',
          'Este código de acceso ya está registrado en otro dispositivo.\n\nPor favor contacta al administrador para liberarlo.'
        );
      } else {
        showErrorModal('Error', detail);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (password?: string) => {
    // Ensure pwd is a string - handle both direct call and event call
    const pwd = typeof password === 'string' ? password : adminPassword;
    Keyboard.dismiss();
    if (!pwd || !pwd.trim()) {
      Alert.alert('Error', 'Por favor ingresa la contraseña de administrador');
      return;
    }
    
    setLoading(true);
    try {
      await apiService.adminLogin(pwd.trim());
      setAdmin(true);
      router.replace('/admin');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Contraseña inválida');
    } finally {
      setLoading(false);
    }
  };

  // Función para mostrar el prompt nativo de iOS
  const showAdminPrompt = () => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        'Acceso Administrador',
        'Ingresa la contraseña de administrador',
        [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Entrar', 
            onPress: (password) => {
              if (password) {
                handleAdminLogin(password);
              }
            }
          },
        ],
        'secure-text',
        '',
        'default'
      );
    } else {
      setShowAdminLogin(true);
    }
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  // Show loading screen while checking for saved access code
  if (autoLogging && loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.autoLoginContainer}>
          <View style={styles.logoContainer}>
            <Ionicons name="airplane" size={56} color="#2196F3" />
          </View>
          <Text style={styles.title}>AeroEnglish</Text>
          <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 24 }} />
          <Text style={styles.autoLoginText}>Iniciando sesión...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
            
            {/* Intro Video Button */}
            {introVideo && (
              <TouchableOpacity
                style={styles.introVideoButton}
                onPress={() => setShowIntroModal(true)}
              >
                <Ionicons name="play-circle" size={20} color="#FF9800" />
                <Text style={styles.introVideoText}>Ver Video Introductorio</Text>
              </TouchableOpacity>
            )}
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
                  onPress={showAdminPrompt}
                >
                  <Ionicons name="settings-outline" size={16} color="#666" />
                  <Text style={styles.adminLinkText}>Acceso Administrador</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.adminInputWrapper}>
                  <Ionicons name="lock-closed-outline" size={22} color="#666" style={styles.adminInputIcon} />
                  <TextInput
                    style={styles.adminInput}
                    placeholder="Contraseña Admin"
                    placeholderTextColor="#666"
                    defaultValue=""
                    onChangeText={(text) => {
                      setAdminPassword(text);
                    }}
                    secureTextEntry={false}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="default"
                    textContentType="none"
                    passwordRules=""
                    importantForAutofill="no"
                  />
                </View>

                <TouchableOpacity
                  style={[styles.button, styles.adminButton]}
                  onPress={() => handleAdminLogin()}
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
      
      {/* Intro Video Modal */}
      <Modal
        visible={showIntroModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowIntroModal(false)}
      >
        <View style={styles.introModalOverlay}>
          <View style={styles.introModalContent}>
            <View style={styles.introModalHeader}>
              <Text style={styles.introModalTitle}>Video Introductorio</Text>
              <TouchableOpacity onPress={() => setShowIntroModal(false)}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
            </View>
            {introVideo && (
              <View style={styles.introVideoContainer}>
                <ExpoVideo
                  source={{ uri: `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/videos/${introVideo.id}/stream` }}
                  style={styles.introVideoPlayer}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={showIntroModal}
                  isLooping={false}
                />
                <Text style={styles.introVideoTitle}>{introVideo.title}</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Error Modal - Works on all platforms including web */}
      <Modal
        visible={errorModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setErrorModal({ ...errorModal, visible: false })}
      >
        <View style={styles.errorModalOverlay}>
          <View style={styles.errorModalContent}>
            <View style={styles.errorModalIcon}>
              <Ionicons 
                name={errorModal.title.includes('Bloqueado') ? "lock-closed" : "alert-circle"} 
                size={48} 
                color={errorModal.title.includes('Bloqueado') ? "#F44336" : "#FF9800"} 
              />
            </View>
            <Text style={styles.errorModalTitle}>{errorModal.title}</Text>
            <Text style={styles.errorModalMessage}>{errorModal.message}</Text>
            <TouchableOpacity
              style={styles.errorModalButton}
              onPress={() => setErrorModal({ ...errorModal, visible: false })}
            >
              <Text style={styles.errorModalButtonText}>Entendido</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  introVideoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FF980020',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FF9800',
    gap: 8,
  },
  introVideoText: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '600',
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
  inputIOS: {
    paddingTop: 18,
    paddingBottom: 18,
  },
  iosHint: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 16,
  },
  adminInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 16,
    paddingLeft: 16,
    height: 56,
  },
  adminInputIcon: {
    marginRight: 12,
  },
  adminInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: 56,
    paddingRight: 16,
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
  // Error Modal Styles
  errorModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorModalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 340,
    width: '100%',
    borderWidth: 1,
    borderColor: '#333',
  },
  errorModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F4433620',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorModalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorModalMessage: {
    color: '#aaa',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  errorModalButton: {
    backgroundColor: '#F44336',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 12,
    minWidth: 150,
  },
  errorModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Intro Video Modal Styles
  introModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  introModalContent: {
    width: '95%',
    maxWidth: 500,
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    overflow: 'hidden',
  },
  introModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  introModalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  introVideoContainer: {
    width: '100%',
  },
  introVideoPlayer: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  introVideoTitle: {
    color: '#fff',
    fontSize: 14,
    padding: 12,
    textAlign: 'center',
  },
  // Auto Login Styles
  autoLoginContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  autoLoginText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
  },
});
