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
import { Category } from '../../src/types';

export default function ManageCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await apiService.getCategories();
      // Sort by order if available
      const sorted = data.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
      setCategories(sorted);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Por favor ingresa un nombre de categoría');
      return;
    }

    setCreating(true);
    try {
      const newCategory = await apiService.createCategory({ 
        name: name.trim(), 
        description: description.trim(),
        order: categories.length 
      });
      setCategories([...categories, newCategory]);
      setModalVisible(false);
      setName('');
      setDescription('');
      Alert.alert('Éxito', 'Categoría creada');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Error al crear categoría');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setName(category.name);
    setDescription(category.description || '');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingCategory || !name.trim()) {
      Alert.alert('Error', 'Por favor ingresa un nombre de categoría');
      return;
    }

    setSaving(true);
    try {
      await apiService.updateCategory(editingCategory.id, {
        name: name.trim(),
        description: description.trim(),
      });
      setCategories(categories.map(c => 
        c.id === editingCategory.id 
          ? { ...c, name: name.trim(), description: description.trim() }
          : c
      ));
      setEditModalVisible(false);
      setEditingCategory(null);
      setName('');
      setDescription('');
      Alert.alert('Éxito', 'Categoría actualizada');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Error al actualizar categoría');
    } finally {
      setSaving(false);
    }
  };

  const moveCategory = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= categories.length) return;

    const newCategories = [...categories];
    [newCategories[index], newCategories[newIndex]] = [newCategories[newIndex], newCategories[index]];
    
    // Update order property
    const updatedCategories = newCategories.map((cat, idx) => ({ ...cat, order: idx }));
    setCategories(updatedCategories);

    // Save order to backend
    try {
      await apiService.updateCategoryOrder(updatedCategories.map(c => ({ id: c.id, order: c.order })));
    } catch (error) {
      console.error('Error saving category order:', error);
    }
  };

  const handleDelete = (category: Category) => {
    Alert.alert(
      'Eliminar Categoría',
      `¿Estás seguro que deseas eliminar "${category.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.deleteCategory(category.id);
              setCategories(categories.filter(c => c.id !== category.id));
              Alert.alert('Éxito', 'Categoría eliminada');
            } catch (error) {
              Alert.alert('Error', 'Error al eliminar categoría');
            }
          },
        },
      ]
    );
  };

  const renderCategory = ({ item, index }: { item: Category; index: number }) => (
    <View style={styles.categoryCard}>
      {/* Move buttons */}
      <View style={styles.moveButtons}>
        <TouchableOpacity
          style={[styles.moveBtn, index === 0 && styles.moveBtnDisabled]}
          onPress={() => moveCategory(index, 'up')}
          disabled={index === 0}
        >
          <Ionicons name="chevron-up" size={18} color={index === 0 ? '#444' : '#888'} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.moveBtn, index === categories.length - 1 && styles.moveBtnDisabled]}
          onPress={() => moveCategory(index, 'down')}
          disabled={index === categories.length - 1}
        >
          <Ionicons name="chevron-down" size={18} color={index === categories.length - 1 ? '#444' : '#888'} />
        </TouchableOpacity>
      </View>

      <View style={styles.categoryIcon}>
        <Ionicons name="folder" size={24} color="#FF9800" />
      </View>
      <View style={styles.categoryInfo}>
        <Text style={styles.categoryName}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.categoryDescription}>{item.description}</Text>
        ) : null}
      </View>
      
      {/* Edit button */}
      <TouchableOpacity
        style={styles.editButton}
        onPress={() => handleEdit(item)}
      >
        <Ionicons name="pencil" size={18} color="#2196F3" />
      </TouchableOpacity>
      
      {/* Delete button */}
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDelete(item)}
      >
        <Ionicons name="trash-outline" size={18} color="#F44336" />
      </TouchableOpacity>
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
        data={categories}
        renderItem={renderCategory}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-outline" size={64} color="#444" />
            <Text style={styles.emptyText}>Sin categorías</Text>
            <Text style={styles.emptySubtext}>
              Las categorías ayudan a organizar tus videos
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>

      {/* Create Modal */}
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
              <Text style={styles.modalTitle}>Nueva Categoría</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                style={styles.input}
                placeholder="ej. Comunicaciones de Despegue"
                placeholderTextColor="#666"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Descripción</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Descripción de la categoría"
                placeholderTextColor="#666"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
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
                <Text style={styles.createButtonText}>Crear Categoría</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Modal */}
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
              <Text style={styles.modalTitle}>Editar Categoría</Text>
              <TouchableOpacity onPress={() => {
                setEditModalVisible(false);
                setEditingCategory(null);
                setName('');
                setDescription('');
              }}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Nombre *</Text>
              <TextInput
                style={styles.input}
                placeholder="ej. Comunicaciones de Despegue"
                placeholderTextColor="#666"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Descripción</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Descripción de la categoría"
                placeholderTextColor="#666"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={3}
              />
            </View>

            <TouchableOpacity
              style={[styles.createButton, saving && styles.createButtonDisabled]}
              onPress={handleSaveEdit}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createButtonText}>Guardar Cambios</Text>
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
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  moveButtons: {
    marginRight: 10,
  },
  moveBtn: {
    padding: 4,
  },
  moveBtnDisabled: {
    opacity: 0.3,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  categoryDescription: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  editButton: {
    padding: 10,
  },
  deleteButton: {
    padding: 10,
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
  emptySubtext: {
    color: '#444',
    fontSize: 14,
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF9800',
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
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  createButton: {
    backgroundColor: '#FF9800',
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
