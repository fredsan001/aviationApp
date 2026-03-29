import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../src/utils/api';
import { AccessCode } from '../../src/types';

interface AccessCodeWithDevice extends AccessCode {
  registered_device_id?: string;
  device_registered_at?: string;
  student_email?: string;
  student_phone?: string;
  student_notes?: string;
  student_full_name?: string;
}

interface LoginHistoryItem {
  _id: string;
  access_code: string;
  timestamp: string;
  device_id: string;
  ip_address?: string;
  success: boolean;
  reason?: string;
}

interface CodeDetails {
  login_history: LoginHistoryItem[];
  stats: {
    total_logins: number;
    successful_logins: number;
    failed_attempts: number;
  };
}

export default function ManageAccessCodes() {
  const [codes, setCodes] = useState<AccessCodeWithDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [clientName, setClientName] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [releasingDevice, setReleasingDevice] = useState<string | null>(null);
  
  // Details Modal State
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [selectedCode, setSelectedCode] = useState<AccessCodeWithDevice | null>(null);
  const [codeDetails, setCodeDetails] = useState<CodeDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  
  // Edit Profile Modal State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    try {
      const data = await apiService.getAccessCodes();
      setCodes(data);
    } catch (error) {
      console.error('Error fetching codes:', error);
      Alert.alert('Error', 'Failed to load access codes');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!clientName.trim()) {
      Alert.alert('Error', 'Please enter a client name');
      return;
    }

    setCreating(true);
    try {
      const newCode = await apiService.createAccessCode(
        clientName.trim(),
        customCode.trim() || undefined
      );
      setCodes([newCode, ...codes]);
      setModalVisible(false);
      setClientName('');
      setCustomCode('');
      Alert.alert('Success', `Access code created: ${newCode.code}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create access code');
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (code: AccessCode) => {
    try {
      const result = await apiService.toggleAccessCode(code.id);
      setCodes(codes.map(c => 
        c.id === code.id ? { ...c, is_active: result.is_active } : c
      ));
    } catch (error) {
      Alert.alert('Error', 'Failed to toggle access code');
    }
  };

  const handleDelete = (code: AccessCodeWithDevice) => {
    Alert.alert(
      'Delete Access Code',
      `Are you sure you want to delete the code for "${code.client_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteAccessCode(code.id);
              setCodes(codes.filter(c => c.id !== code.id));
              Alert.alert('Success', 'Access code deleted');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete access code');
            }
          },
        },
      ]
    );
  };

  const handleReleaseDevice = async (code: AccessCodeWithDevice) => {
    Alert.alert(
      'Liberar Dispositivo',
      `¿Liberar el dispositivo registrado para "${code.client_name}"? El usuario podrá acceder desde un nuevo dispositivo.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Liberar',
          onPress: async () => {
            setReleasingDevice(code.id);
            try {
              await apiService.releaseDevice(code.id);
              setCodes(codes.map(c => 
                c.id === code.id 
                  ? { ...c, registered_device_id: undefined, device_registered_at: undefined }
                  : c
              ));
              Alert.alert('Éxito', 'Dispositivo liberado correctamente');
            } catch (error) {
              Alert.alert('Error', 'No se pudo liberar el dispositivo');
            } finally {
              setReleasingDevice(null);
            }
          },
        },
      ]
    );
  };

  // Fetch details for a specific code
  const handleViewDetails = async (code: AccessCodeWithDevice) => {
    setSelectedCode(code);
    setDetailsModalVisible(true);
    setLoadingDetails(true);
    
    try {
      const details = await apiService.getAccessCodeDetails(code.id);
      setCodeDetails(details);
    } catch (error) {
      console.error('Error fetching details:', error);
      Alert.alert('Error', 'No se pudieron cargar los detalles');
    } finally {
      setLoadingDetails(false);
    }
  };

  // Open edit profile modal
  const handleEditProfile = (code: AccessCodeWithDevice) => {
    setSelectedCode(code);
    setEditFullName(code.student_full_name || code.client_name || '');
    setEditEmail(code.student_email || '');
    setEditPhone(code.student_phone || '');
    setEditNotes(code.student_notes || '');
    setEditModalVisible(true);
  };

  // Save profile changes
  const handleSaveProfile = async () => {
    if (!selectedCode) return;
    
    setSavingProfile(true);
    try {
      await apiService.updateStudentProfile(selectedCode.id, {
        full_name: editFullName.trim() || undefined,
        email: editEmail.trim() || undefined,
        phone: editPhone.trim() || undefined,
        notes: editNotes.trim() || undefined,
      });
      
      // Update local state
      setCodes(codes.map(c => 
        c.id === selectedCode.id 
          ? { 
              ...c, 
              student_full_name: editFullName.trim(),
              student_email: editEmail.trim(),
              student_phone: editPhone.trim(),
              student_notes: editNotes.trim()
            }
          : c
      ));
      
      setEditModalVisible(false);
      Alert.alert('Éxito', 'Perfil actualizado correctamente');
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'No se pudo guardar el perfil');
    } finally {
      setSavingProfile(false);
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Truncate device ID for display
  const truncateDeviceId = (deviceId: string) => {
    if (!deviceId) return 'N/A';
    if (deviceId.length <= 12) return deviceId;
    return deviceId.substring(0, 8) + '...' + deviceId.substring(deviceId.length - 4);
  };

  const renderCode = ({ item }: { item: AccessCodeWithDevice }) => (
    <View style={[styles.codeCard, !item.is_active && styles.codeCardInactive]}>
      <View style={styles.codeInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.clientName}>{item.student_full_name || item.client_name}</Text>
          {item.student_email && (
            <View style={styles.contactBadge}>
              <Ionicons name="mail-outline" size={12} color="#2196F3" />
            </View>
          )}
        </View>
        <View style={styles.codeContainer}>
          <Ionicons name="key" size={16} color="#2196F3" />
          <Text style={styles.codeText}>{item.code}</Text>
        </View>
        <Text style={styles.dateText}>
          Creado: {new Date(item.created_at).toLocaleDateString()}
        </Text>
        
        {/* Device Status */}
        {item.registered_device_id ? (
          <View style={styles.deviceStatus}>
            <View style={styles.deviceRegistered}>
              <Ionicons name="phone-portrait" size={14} color="#FF9800" />
              <Text style={styles.deviceText}>Dispositivo registrado</Text>
            </View>
            <TouchableOpacity
              style={styles.releaseButton}
              onPress={() => handleReleaseDevice(item)}
              disabled={releasingDevice === item.id}
            >
              {releasingDevice === item.id ? (
                <ActivityIndicator size="small" color="#F44336" />
              ) : (
                <>
                  <Ionicons name="lock-open-outline" size={14} color="#F44336" />
                  <Text style={styles.releaseText}>Liberar</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.deviceStatus}>
            <Ionicons name="phone-portrait-outline" size={14} color="#4CAF50" />
            <Text style={styles.deviceFreeText}>Sin dispositivo</Text>
          </View>
        )}
        
        {/* Action Buttons Row */}
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity
            style={styles.detailsButton}
            onPress={() => handleViewDetails(item)}
          >
            <Ionicons name="time-outline" size={16} color="#9C27B0" />
            <Text style={styles.detailsButtonText}>Historial</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => handleEditProfile(item)}
          >
            <Ionicons name="create-outline" size={16} color="#2196F3" />
            <Text style={styles.editButtonText}>Editar</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.codeActions}>
        <TouchableOpacity
          style={[styles.statusBadge, item.is_active ? styles.activeBadge : styles.inactiveBadge]}
          onPress={() => handleToggle(item)}
        >
          <Text style={styles.statusText}>{item.is_active ? 'Activo' : 'Inactivo'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDelete(item)}
        >
          <Ionicons name="trash-outline" size={20} color="#F44336" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={codes}
        renderItem={renderCode}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="key-outline" size={64} color="#444" />
            <Text style={styles.emptyText}>No access codes yet</Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Access Code</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Client Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter client name"
                placeholderTextColor="#666"
                value={clientName}
                onChangeText={setClientName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Custom Code (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Leave empty for auto-generated code"
                placeholderTextColor="#666"
                value={customCode}
                onChangeText={setCustomCode}
                autoCapitalize="characters"
                maxLength={12}
              />
            </View>

            <TouchableOpacity
              style={[styles.createButton, creating && styles.createButtonDisabled]}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createButtonText}>Create Code</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Details Modal - Login History */}
      <Modal
        visible={detailsModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.detailsModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Historial de Accesos
              </Text>
              <TouchableOpacity onPress={() => setDetailsModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {loadingDetails ? (
              <View style={styles.loadingDetailsContainer}>
                <ActivityIndicator size="large" color="#9C27B0" />
                <Text style={styles.loadingText}>Cargando historial...</Text>
              </View>
            ) : codeDetails ? (
              <ScrollView style={styles.detailsScroll} showsVerticalScrollIndicator={false}>
                {/* Student Info Summary */}
                <View style={styles.studentSummary}>
                  <Text style={styles.studentName}>
                    {selectedCode?.student_full_name || selectedCode?.client_name}
                  </Text>
                  <Text style={styles.codeLabel}>Código: {selectedCode?.code}</Text>
                  {selectedCode?.registered_device_id && (
                    <View style={styles.deviceInfoBox}>
                      <Ionicons name="phone-portrait" size={16} color="#FF9800" />
                      <Text style={styles.deviceIdText}>
                        ID: {truncateDeviceId(selectedCode.registered_device_id)}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Stats */}
                <View style={styles.statsContainer}>
                  <View style={styles.statBox}>
                    <Text style={styles.statNumber}>{codeDetails.stats.total_logins}</Text>
                    <Text style={styles.statLabel}>Total</Text>
                  </View>
                  <View style={[styles.statBox, styles.statBoxSuccess]}>
                    <Text style={[styles.statNumber, styles.statSuccess]}>
                      {codeDetails.stats.successful_logins}
                    </Text>
                    <Text style={styles.statLabel}>Exitosos</Text>
                  </View>
                  <View style={[styles.statBox, styles.statBoxFailed]}>
                    <Text style={[styles.statNumber, styles.statFailed]}>
                      {codeDetails.stats.failed_attempts}
                    </Text>
                    <Text style={styles.statLabel}>Fallidos</Text>
                  </View>
                </View>

                {/* Login History List */}
                <Text style={styles.sectionTitle}>Historial de Intentos</Text>
                {codeDetails.login_history.length === 0 ? (
                  <View style={styles.emptyHistory}>
                    <Ionicons name="time-outline" size={32} color="#666" />
                    <Text style={styles.emptyHistoryText}>Sin registros de acceso</Text>
                  </View>
                ) : (
                  codeDetails.login_history.map((entry, index) => (
                    <View 
                      key={entry._id || index} 
                      style={[
                        styles.historyItem,
                        entry.success ? styles.historySuccess : styles.historyFailed
                      ]}
                    >
                      <View style={styles.historyLeft}>
                        <Ionicons 
                          name={entry.success ? "checkmark-circle" : "close-circle"} 
                          size={20} 
                          color={entry.success ? "#4CAF50" : "#F44336"} 
                        />
                      </View>
                      <View style={styles.historyContent}>
                        <Text style={styles.historyDate}>
                          {formatDate(entry.timestamp)}
                        </Text>
                        <Text style={styles.historyDevice}>
                          Dispositivo: {truncateDeviceId(entry.device_id)}
                        </Text>
                        {entry.ip_address && (
                          <Text style={styles.historyIp}>
                            IP: {entry.ip_address}
                          </Text>
                        )}
                        {!entry.success && entry.reason && (
                          <Text style={styles.historyReason}>
                            Razón: {entry.reason}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            ) : (
              <View style={styles.emptyHistory}>
                <Text style={styles.emptyHistoryText}>No se encontraron datos</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Profile Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Perfil</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nombre Completo</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre del estudiante"
                  placeholderTextColor="#666"
                  value={editFullName}
                  onChangeText={setEditFullName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Correo Electrónico</Text>
                <TextInput
                  style={styles.input}
                  placeholder="correo@ejemplo.com"
                  placeholderTextColor="#666"
                  value={editEmail}
                  onChangeText={setEditEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  style={styles.input}
                  placeholder="+52 123 456 7890"
                  placeholderTextColor="#666"
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Notas</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  placeholder="Notas adicionales sobre el estudiante..."
                  placeholderTextColor="#666"
                  value={editNotes}
                  onChangeText={setEditNotes}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                style={[styles.createButton, savingProfile && styles.createButtonDisabled]}
                onPress={handleSaveProfile}
                disabled={savingProfile}
              >
                {savingProfile ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createButtonText}>Guardar Cambios</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  listContent: {
    padding: 16,
  },
  codeCard: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  codeCardInactive: {
    opacity: 0.6,
  },
  codeInfo: {
    flex: 1,
  },
  clientName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  codeText: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
  },
  dateText: {
    color: '#666',
    fontSize: 12,
  },
  deviceStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  deviceRegistered: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  deviceText: {
    color: '#FF9800',
    fontSize: 12,
  },
  deviceFreeText: {
    color: '#4CAF50',
    fontSize: 12,
  },
  releaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4433620',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
    gap: 4,
  },
  releaseText: {
    color: '#F44336',
    fontSize: 11,
    fontWeight: '600',
  },
  codeActions: {
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  activeBadge: {
    backgroundColor: '#4CAF50',
  },
  inactiveBadge: {
    backgroundColor: '#666',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    color: '#666',
    fontSize: 18,
    marginTop: 16,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#9C27B0',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
  },
  createButton: {
    backgroundColor: '#9C27B0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // New styles for action buttons
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  contactBadge: {
    backgroundColor: '#2196F320',
    padding: 4,
    borderRadius: 8,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  detailsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#9C27B020',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  detailsButtonText: {
    color: '#9C27B0',
    fontSize: 13,
    fontWeight: '600',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F320',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  editButtonText: {
    color: '#2196F3',
    fontSize: 13,
    fontWeight: '600',
  },
  // Details Modal Styles
  detailsModalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  loadingDetailsContainer: {
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    color: '#666',
    marginTop: 12,
  },
  detailsScroll: {
    maxHeight: '90%',
  },
  studentSummary: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  studentName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  codeLabel: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '600',
  },
  deviceInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: '#FF980020',
    padding: 10,
    borderRadius: 8,
  },
  deviceIdText: {
    color: '#FF9800',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statBoxSuccess: {
    backgroundColor: '#4CAF5020',
  },
  statBoxFailed: {
    backgroundColor: '#F4433620',
  },
  statNumber: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  statSuccess: {
    color: '#4CAF50',
  },
  statFailed: {
    color: '#F44336',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptyHistory: {
    alignItems: 'center',
    padding: 32,
  },
  emptyHistoryText: {
    color: '#666',
    marginTop: 8,
  },
  historyItem: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  historySuccess: {
    borderLeftColor: '#4CAF50',
  },
  historyFailed: {
    borderLeftColor: '#F44336',
  },
  historyLeft: {
    marginRight: 12,
    justifyContent: 'center',
  },
  historyContent: {
    flex: 1,
  },
  historyDate: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  historyDevice: {
    color: '#888',
    fontSize: 12,
  },
  historyIp: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  historyReason: {
    color: '#F44336',
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  // Edit Profile Modal Styles
  notesInput: {
    minHeight: 100,
    paddingTop: 16,
  },
});
