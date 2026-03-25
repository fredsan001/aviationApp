import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { apiService } from '../../src/utils/api';
import { Category } from '../../src/types';

export default function UploadVideo() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await apiService.getCategories();
      setCategories(data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleToggleCategory = (cat: string) => {
    if (selectedCategories.includes(cat)) {
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert('Error', 'Ingresa un nombre para la categoría');
      return;
    }

    setCreatingCategory(true);
    try {
      await apiService.createCategory({
        name: newCategoryName.trim(),
        description: '',
      });
      // Add to selected categories
      setSelectedCategories([...selectedCategories, newCategoryName.trim()]);
      setShowNewCategoryInput(false);
      setNewCategoryName('');
      // Refresh categories list
      await fetchCategories();
      Alert.alert('Éxito', 'Categoría creada correctamente');
    } catch (error) {
      console.error('Error creating category:', error);
      Alert.alert('Error', 'No se pudo crear la categoría');
    } finally {
      setCreatingCategory(false);
    }
  };

  const pickVideo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedFile(result.assets[0]);
        setUploadSuccess(false);
      }
    } catch (error) {
      console.error('Error picking video:', error);
      Alert.alert('Error', 'No se pudo seleccionar el video');
    }
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Por favor ingresa un título para el video');
      return;
    }
    if (!selectedFile) {
      Alert.alert('Error', 'Por favor selecciona un archivo de video');
      return;
    }
    if (selectedCategories.length === 0) {
      Alert.alert('Error', 'Por favor selecciona al menos una categoría');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('category', selectedCategories[0]); // Main category for backwards compatibility
      formData.append('categories', JSON.stringify(selectedCategories)); // Multiple categories
      formData.append('auto_transcribe', autoTranscribe ? 'true' : 'false');
      
      // Handle file differently for web vs native
      if (Platform.OS === 'web') {
        const response = await fetch(selectedFile.uri);
        const blob = await response.blob();
        formData.append('file', blob, selectedFile.name || 'video.mp4');
      } else {
        formData.append('file', {
          uri: selectedFile.uri,
          name: selectedFile.name || 'video.mp4',
          type: selectedFile.mimeType || 'video/mp4',
        } as any);
      }

      await apiService.uploadVideo(formData, (progress) => {
        setUploadProgress(progress);
      });

      setUploadSuccess(true);
      setUploading(false);

    } catch (error: any) {
      console.error('Upload error:', error);
      setUploading(false);
      Alert.alert('Error', error.response?.data?.detail || 'Error al subir el video. Intenta de nuevo.');
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setSelectedCategories([]);
    setSelectedFile(null);
    setUploadSuccess(false);
    setUploadProgress(0);
  };

  // Success Screen
  if (uploadSuccess) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark-circle" size={80} color="#4CAF50" />
          </View>
          <Text style={styles.successTitle}>¡Video Subido!</Text>
          <Text style={styles.successMessage}>
            El video "{title}" se ha subido correctamente.
          </Text>
          {autoTranscribe && (
            <Text style={styles.transcribeMessage}>
              La IA está generando los subtítulos automáticamente. Este proceso puede tomar unos minutos.
            </Text>
          )}
          
          <View style={styles.successButtons}>
            <TouchableOpacity 
              style={styles.successButton}
              onPress={() => router.push('/admin/videos')}
            >
              <Ionicons name="videocam" size={20} color="#fff" />
              <Text style={styles.successButtonText}>Ver Videos</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.successButton, styles.secondaryButton]}
              onPress={resetForm}
            >
              <Ionicons name="add" size={20} color="#2196F3" />
              <Text style={[styles.successButtonText, styles.secondaryButtonText]}>Subir Otro</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.successButton, styles.outlineButton]}
              onPress={() => router.replace('/admin')}
            >
              <Ionicons name="home" size={20} color="#888" />
              <Text style={[styles.successButtonText, styles.outlineButtonText]}>Ir al Inicio</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Video Selection */}
          <TouchableOpacity
            style={styles.fileSelector}
            onPress={pickVideo}
            disabled={uploading}
          >
            <View style={styles.fileSelectorContent}>
              <Ionicons 
                name={selectedFile ? 'checkmark-circle' : 'cloud-upload'} 
                size={48} 
                color={selectedFile ? '#4CAF50' : '#2196F3'} 
              />
              <Text style={styles.fileSelectorText}>
                {selectedFile ? selectedFile.name : 'Toca para seleccionar un video'}
              </Text>
              {selectedFile && (
                <Text style={styles.fileSizeText}>
                  {((selectedFile.size || 0) / (1024 * 1024)).toFixed(2)} MB
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Title Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Título *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa el título del video"
              placeholderTextColor="#666"
              value={title}
              onChangeText={setTitle}
              editable={!uploading}
            />
          </View>

          {/* Description Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Descripción</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ingresa una descripción (opcional)"
              placeholderTextColor="#666"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              editable={!uploading}
            />
          </View>

          {/* Category Selector - Multiple */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Categorías</Text>
            <TouchableOpacity
              style={styles.categorySelector}
              onPress={() => setShowCategoryModal(true)}
              disabled={uploading}
            >
              <Text style={[styles.categorySelectorText, selectedCategories.length === 0 && { color: '#666' }]}>
                {selectedCategories.length > 0 
                  ? selectedCategories.join(', ')
                  : 'Seleccionar categorías'}
              </Text>
              <Ionicons name="chevron-down" size={20} color="#888" />
            </TouchableOpacity>
            {selectedCategories.length > 0 && (
              <View style={styles.selectedCategoriesWrap}>
                {selectedCategories.map((cat) => (
                  <View key={cat} style={styles.categoryTag}>
                    <Text style={styles.categoryTagText}>{cat}</Text>
                    <TouchableOpacity onPress={() => handleToggleCategory(cat)}>
                      <Ionicons name="close-circle" size={18} color="#888" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Auto Transcribe Toggle */}
          <View style={styles.toggleGroup}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Generar Subtítulos con IA</Text>
              <Text style={styles.toggleDescription}>Transcribe automáticamente el audio a texto</Text>
            </View>
            <Switch
              value={autoTranscribe}
              onValueChange={setAutoTranscribe}
              trackColor={{ false: '#333', true: '#4CAF50' }}
              thumbColor={autoTranscribe ? '#fff' : '#888'}
              disabled={uploading}
            />
          </View>

          {/* Upload Progress */}
          {uploading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {uploadProgress < 100 ? `Subiendo... ${uploadProgress}%` : 'Procesando...'}
              </Text>
            </View>
          )}

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.uploadButton, (!selectedFile || uploading) && styles.uploadButtonDisabled]}
              onPress={handleUpload}
              disabled={!selectedFile || uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={24} color="#fff" />
                  <Text style={styles.uploadButtonText}>Subir Video</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => router.back()}
              disabled={uploading}
            >
              <Ionicons name="arrow-back" size={20} color="#888" />
              <Text style={styles.cancelButtonText}>Volver al Dashboard</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Category Selection Modal - Multiple */}
      <Modal
        visible={showCategoryModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Seleccionar Categorías</Text>
              <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                <Ionicons name="checkmark" size={24} color="#4CAF50" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>Puedes seleccionar múltiples categorías</Text>

            <FlatList
              data={categories}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = selectedCategories.includes(item.name);
                return (
                  <TouchableOpacity
                    style={[
                      styles.categoryOption,
                      isSelected && styles.categoryOptionActive
                    ]}
                    onPress={() => handleToggleCategory(item.name)}
                  >
                    <Ionicons 
                      name={isSelected ? "checkbox" : "square-outline"} 
                      size={22} 
                      color={isSelected ? "#4CAF50" : "#666"} 
                    />
                    <Text style={[
                      styles.categoryOptionText,
                      isSelected && styles.categoryOptionTextActive
                    ]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No hay categorías. Crea una nueva.</Text>
              }
            />

            {/* Create New Category */}
            {showNewCategoryInput ? (
              <View style={styles.newCategoryInput}>
                <TextInput
                  style={styles.newCategoryTextInput}
                  value={newCategoryName}
                  onChangeText={setNewCategoryName}
                  placeholder="Nombre de la nueva categoría"
                  placeholderTextColor="#666"
                  autoFocus
                />
                <View style={styles.newCategoryButtons}>
                  <TouchableOpacity
                    style={styles.newCategoryCancelBtn}
                    onPress={() => {
                      setShowNewCategoryInput(false);
                      setNewCategoryName('');
                    }}
                  >
                    <Text style={styles.newCategoryCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.newCategoryCreateBtn, creatingCategory && { opacity: 0.7 }]}
                    onPress={handleCreateCategory}
                    disabled={creatingCategory}
                  >
                    {creatingCategory ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.newCategoryCreateText}>Crear</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.createCategoryBtn}
                onPress={() => setShowNewCategoryInput(true)}
              >
                <Ionicons name="add-circle" size={24} color="#4CAF50" />
                <Text style={styles.createCategoryText}>Crear Nueva Categoría</Text>
              </TouchableOpacity>
            )}
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  fileSelector: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 32,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  fileSelectorContent: {
    alignItems: 'center',
  },
  fileSelectorText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  fileSizeText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  toggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleDescription: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  progressText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  buttonContainer: {
    gap: 12,
  },
  uploadButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  uploadButtonDisabled: {
    backgroundColor: '#333',
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 16,
  },
  // Success screen styles
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successIcon: {
    marginBottom: 24,
  },
  successTitle: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  successMessage: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
  },
  transcribeMessage: {
    color: '#FF9800',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 20,
  },
  successButtons: {
    width: '100%',
    gap: 12,
  },
  successButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  secondaryButton: {
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  outlineButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#333',
  },
  successButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#2196F3',
  },
  outlineButtonText: {
    color: '#888',
  },
  // Category Modal Styles
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
  },
  categorySelectorText: {
    color: '#fff',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  categoryOptionActive: {
    backgroundColor: '#1E3D1F',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  categoryOptionText: {
    color: '#fff',
    fontSize: 16,
    flex: 1,
  },
  categoryOptionTextActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  createCategoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    marginTop: 12,
    gap: 8,
  },
  createCategoryText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
  },
  newCategoryInput: {
    marginTop: 12,
  },
  newCategoryTextInput: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  newCategoryButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  newCategoryCancelBtn: {
    flex: 1,
    padding: 14,
    backgroundColor: '#333',
    borderRadius: 10,
    alignItems: 'center',
  },
  newCategoryCancelText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '600',
  },
  newCategoryCreateBtn: {
    flex: 1,
    padding: 14,
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    alignItems: 'center',
  },
  newCategoryCreateText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  modalSubtitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 16,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  selectedCategoriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  categoryTagText: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '500',
  },
});
