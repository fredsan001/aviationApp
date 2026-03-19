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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiService } from '../../src/utils/api';
import { AccessCode } from '../../src/types';

export default function ManageAccessCodes() {
  const [codes, setCodes] = useState<AccessCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [clientName, setClientName] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [creating, setCreating] = useState(false);

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

  const handleDelete = (code: AccessCode) => {
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

  const renderCode = ({ item }: { item: AccessCode }) => (
    <View style={[styles.codeCard, !item.is_active && styles.codeCardInactive]}>
      <View style={styles.codeInfo}>
        <Text style={styles.clientName}>{item.client_name}</Text>
        <View style={styles.codeContainer}>
          <Ionicons name="key" size={16} color="#2196F3" />
          <Text style={styles.codeText}>{item.code}</Text>
        </View>
        <Text style={styles.dateText}>
          Created: {new Date(item.created_at).toLocaleDateString()}
        </Text>
      </View>
      <View style={styles.codeActions}>
        <TouchableOpacity
          style={[styles.statusBadge, item.is_active ? styles.activeBadge : styles.inactiveBadge]}
          onPress={() => handleToggle(item)}
        >
          <Text style={styles.statusText}>{item.is_active ? 'Active' : 'Inactive'}</Text>
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
});
