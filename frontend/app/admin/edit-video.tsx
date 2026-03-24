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
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { apiService } from '../../src/utils/api';
import { Video, Subtitle, Category } from '../../src/types';

export default function EditVideo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [video, setVideo] = useState<Video | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showSubtitleModal, setShowSubtitleModal] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState<Subtitle | null>(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [videoData, categoriesData] = await Promise.all([
        apiService.getVideo(id),
        apiService.getCategories(),
      ]);
      setVideo(videoData);
      setTitle(videoData.title);
      setDescription(videoData.description || '');
      // Load multiple categories or fallback to single category
      const cats = videoData.categories?.length > 0 
        ? videoData.categories 
        : (videoData.category ? [videoData.category] : []);
      setSelectedCategories(cats);
      setSubtitles(videoData.subtitles || []);
      setCategories(categoriesData);
    } catch (error) {
      console.error('Error fetching video:', error);
      Alert.alert('Error', 'No se pudo cargar el video');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'El título es requerido');
      return;
    }
    if (selectedCategories.length === 0) {
      Alert.alert('Error', 'Selecciona al menos una categoría');
      return;
    }

    setSaving(true);
    try {
      await apiService.updateVideo(id, {
        title: title.trim(),
        description: description.trim(),
        category: selectedCategories[0], // Main category for backwards compatibility
        categories: selectedCategories,
        subtitles: subtitles,
      });
      Alert.alert('Éxito', 'Video actualizado correctamente', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Error saving video:', error);
      Alert.alert('Error', 'No se pudo guardar el video');
    } finally {
      setSaving(false);
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
      setSelectedCategories([...selectedCategories, newCategoryName.trim()]);
      setShowNewCategoryInput(false);
      setNewCategoryName('');
      const newCategories = await apiService.getCategories();
      setCategories(newCategories);
      Alert.alert('Éxito', 'Categoría creada correctamente');
    } catch (error) {
      Alert.alert('Error', 'No se pudo crear la categoría');
    } finally {
      setCreatingCategory(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleEditSubtitle = (subtitle: Subtitle) => {
    setEditingSubtitle({ ...subtitle });
    setShowSubtitleModal(true);
  };

  const handleSaveSubtitle = () => {
    if (!editingSubtitle) return;

    setSubtitles(subtitles.map(s => 
      s.id === editingSubtitle.id ? editingSubtitle : s
    ));
    setShowSubtitleModal(false);
    setEditingSubtitle(null);
  };

  const handleDeleteSubtitle = (subtitleId: string) => {
    Alert.alert(
      'Eliminar Subtítulo',
      '¿Estás seguro de eliminar este subtítulo?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => setSubtitles(subtitles.filter(s => s.id !== subtitleId))
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Title */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Título *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Título del video"
            placeholderTextColor="#666"
          />
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Descripción</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Descripción del video"
            placeholderTextColor="#666"
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Category Selector - Multiple */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Categorías</Text>
          <TouchableOpacity
            style={styles.categorySelector}
            onPress={() => setShowCategoryModal(true)}
          >
            <Text style={[styles.categorySelectorText, selectedCategories.length === 0 && { color: '#666' }]}>
              {selectedCategories.length > 0 
                ? `${selectedCategories.length} seleccionadas`
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

        {/* Processing Status */}
        {video?.is_processing && (
          <View style={styles.processingBanner}>
            <ActivityIndicator size="small" color="#FF9800" />
            <Text style={styles.processingText}>
              Generando subtítulos... {video.processing_status}
            </Text>
          </View>
        )}

        {/* Subtitles Section */}
        <View style={styles.subtitlesSection}>
          <View style={styles.subtitlesHeader}>
            <Text style={styles.sectionTitle}>
              Subtítulos ({subtitles.length})
            </Text>
            {video?.is_processing && (
              <View style={styles.processingBadge}>
                <Ionicons name="time" size={14} color="#FF9800" />
                <Text style={styles.processingBadgeText}>Procesando</Text>
              </View>
            )}
          </View>

          {subtitles.length > 0 ? (
            subtitles.map((subtitle, index) => (
              <View key={subtitle.id} style={styles.subtitleCard}>
                <View style={styles.subtitleHeader}>
                  <Text style={styles.subtitleIndex}>#{index + 1}</Text>
                  <Text style={styles.subtitleTime}>
                    {formatTime(subtitle.start_time)} - {formatTime(subtitle.end_time)}
                  </Text>
                </View>
                <Text style={styles.subtitleText}>{subtitle.text}</Text>
                <View style={styles.subtitleActions}>
                  <TouchableOpacity
                    style={styles.subtitleAction}
                    onPress={() => handleEditSubtitle(subtitle)}
                  >
                    <Ionicons name="pencil" size={16} color="#2196F3" />
                    <Text style={styles.subtitleActionText}>Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.subtitleAction}
                    onPress={() => handleDeleteSubtitle(subtitle.id)}
                  >
                    <Ionicons name="trash" size={16} color="#F44336" />
                    <Text style={[styles.subtitleActionText, { color: '#F44336' }]}>
                      Eliminar
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.noSubtitles}>
              <Ionicons name="text-outline" size={48} color="#444" />
              <Text style={styles.noSubtitlesText}>No hay subtítulos</Text>
              {!video?.is_processing && (
                <Text style={styles.noSubtitlesHint}>
                  Puedes re-transcribir el video para generar subtítulos automáticamente
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark" size={24} color="#fff" />
              <Text style={styles.saveButtonText}>Guardar Cambios</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelButtonText}>Cancelar</Text>
        </TouchableOpacity>
      </ScrollView>

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
                <Text style={styles.emptyText}>No hay categorías disponibles</Text>
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

      {/* Subtitle Edit Modal */}
      <Modal
        visible={showSubtitleModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSubtitleModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Editar Subtítulo</Text>
              <TouchableOpacity onPress={() => setShowSubtitleModal(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {editingSubtitle && (
              <>
                <View style={styles.subtitleTimeInputs}>
                  <View style={styles.timeInputGroup}>
                    <Text style={styles.timeLabel}>Inicio (seg)</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={editingSubtitle.start_time.toString()}
                      onChangeText={(text) => setEditingSubtitle({
                        ...editingSubtitle,
                        start_time: parseFloat(text) || 0
                      })}
                      keyboardType="numeric"
                      placeholderTextColor="#666"
                    />
                  </View>
                  <View style={styles.timeInputGroup}>
                    <Text style={styles.timeLabel}>Fin (seg)</Text>
                    <TextInput
                      style={styles.timeInput}
                      value={editingSubtitle.end_time.toString()}
                      onChangeText={(text) => setEditingSubtitle({
                        ...editingSubtitle,
                        end_time: parseFloat(text) || 0
                      })}
                      keyboardType="numeric"
                      placeholderTextColor="#666"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Texto</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={editingSubtitle.text}
                    onChangeText={(text) => setEditingSubtitle({
                      ...editingSubtitle,
                      text
                    })}
                    placeholder="Texto del subtítulo"
                    placeholderTextColor="#666"
                    multiline
                  />
                </View>

                <TouchableOpacity
                  style={styles.saveSubtitleBtn}
                  onPress={handleSaveSubtitle}
                >
                  <Text style={styles.saveSubtitleText}>Guardar Subtítulo</Text>
                </TouchableOpacity>
              </>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
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
  processingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF980020',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  processingText: {
    color: '#FF9800',
    fontSize: 14,
    flex: 1,
  },
  subtitlesSection: {
    marginBottom: 24,
  },
  subtitlesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  processingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF980020',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  processingBadgeText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '600',
  },
  subtitleCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  subtitleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  subtitleIndex: {
    color: '#2196F3',
    fontSize: 12,
    fontWeight: 'bold',
  },
  subtitleTime: {
    color: '#888',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  subtitleText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  subtitleActions: {
    flexDirection: 'row',
    gap: 16,
  },
  subtitleAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitleActionText: {
    color: '#2196F3',
    fontSize: 13,
  },
  noSubtitles: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
  },
  noSubtitlesText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  noSubtitlesHint: {
    color: '#444',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  saveButtonDisabled: {
    backgroundColor: '#333',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  cancelButton: {
    alignItems: 'center',
    padding: 16,
  },
  cancelButtonText: {
    color: '#888',
    fontSize: 16,
  },
  // Modal styles
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
  subtitleTimeInputs: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  timeInputGroup: {
    flex: 1,
  },
  timeLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  timeInput: {
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    padding: 14,
    color: '#fff',
    fontSize: 16,
  },
  saveSubtitleBtn: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  saveSubtitleText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
