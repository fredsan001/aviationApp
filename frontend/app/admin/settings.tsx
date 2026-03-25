import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { apiService } from '../../src/utils/api';

interface Video {
  id: string;
  title: string;
}

export default function SettingsScreen() {
  const [helpContent, setHelpContent] = useState('');
  const [introVideoId, setIntroVideoId] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [settings, videosData] = await Promise.all([
        apiService.getAppSettings(),
        apiService.getVideos(),
      ]);
      
      setHelpContent(settings.help_content || '');
      setIntroVideoId(settings.intro_video_id);
      setVideos(videosData.filter((v: any) => !v.is_processing));
      
      if (settings.intro_video_id) {
        const video = videosData.find((v: any) => v.id === settings.intro_video_id);
        setSelectedVideo(video || null);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiService.updateAppSettings({
        help_content: helpContent,
        intro_video_id: introVideoId,
      });
      Alert.alert('Éxito', 'Configuración guardada');
    } catch (error) {
      Alert.alert('Error', 'No se pudo guardar la configuración');
    } finally {
      setSaving(false);
    }
  };

  const selectIntroVideo = (video: Video) => {
    setSelectedVideo(video);
    setIntroVideoId(video.id);
    setVideoModalVisible(false);
  };

  const clearIntroVideo = () => {
    setSelectedVideo(null);
    setIntroVideoId(null);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Configuración' }} />
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {/* Help Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="help-circle" size={24} color="#2196F3" />
              <Text style={styles.sectionTitle}>Contenido de Ayuda</Text>
            </View>
            <Text style={styles.sectionDescription}>
              Este texto se mostrará a los estudiantes en la sección de Ayuda del perfil.
            </Text>
            <TextInput
              style={styles.textArea}
              value={helpContent}
              onChangeText={setHelpContent}
              placeholder="Escribe información de ayuda, instrucciones, contacto, etc..."
              placeholderTextColor="#666"
              multiline
              numberOfLines={10}
              textAlignVertical="top"
            />
          </View>

          {/* Intro Video Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="videocam" size={24} color="#FF9800" />
              <Text style={styles.sectionTitle}>Video Introductorio</Text>
            </View>
            <Text style={styles.sectionDescription}>
              Este video se mostrará en la pantalla de inicio para nuevos usuarios.
            </Text>
            
            {selectedVideo ? (
              <View style={styles.selectedVideoCard}>
                <View style={styles.videoIconContainer}>
                  <Ionicons name="play-circle" size={32} color="#FF9800" />
                </View>
                <View style={styles.videoInfo}>
                  <Text style={styles.videoTitle}>{selectedVideo.title}</Text>
                  <Text style={styles.videoSubtitle}>Video introductorio seleccionado</Text>
                </View>
                <TouchableOpacity style={styles.clearButton} onPress={clearIntroVideo}>
                  <Ionicons name="close-circle" size={24} color="#F44336" />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.selectVideoButton}
                onPress={() => setVideoModalVisible(true)}
              >
                <Ionicons name="add-circle" size={24} color="#FF9800" />
                <Text style={styles.selectVideoText}>Seleccionar Video</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.changeVideoButton}
              onPress={() => setVideoModalVisible(true)}
            >
              <Text style={styles.changeVideoText}>Cambiar video</Text>
            </TouchableOpacity>
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
                <Ionicons name="checkmark-circle" size={22} color="#fff" />
                <Text style={styles.saveButtonText}>Guardar Configuración</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* Video Selection Modal */}
        <Modal
          visible={videoModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setVideoModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Seleccionar Video</Text>
                <TouchableOpacity onPress={() => setVideoModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
              
              <ScrollView style={styles.videoList}>
                {videos.map((video) => (
                  <TouchableOpacity
                    key={video.id}
                    style={[
                      styles.videoOption,
                      introVideoId === video.id && styles.videoOptionSelected
                    ]}
                    onPress={() => selectIntroVideo(video)}
                  >
                    <Ionicons 
                      name="play-circle" 
                      size={24} 
                      color={introVideoId === video.id ? '#FF9800' : '#888'} 
                    />
                    <Text style={[
                      styles.videoOptionText,
                      introVideoId === video.id && styles.videoOptionTextSelected
                    ]}>
                      {video.title}
                    </Text>
                    {introVideoId === video.id && (
                      <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </>
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
  content: {
    padding: 16,
  },
  section: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  sectionDescription: {
    color: '#888',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  textArea: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 15,
    minHeight: 200,
    textAlignVertical: 'top',
  },
  selectedVideoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    padding: 16,
    borderRadius: 12,
  },
  videoIconContainer: {
    marginRight: 12,
  },
  videoInfo: {
    flex: 1,
  },
  videoTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  videoSubtitle: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  clearButton: {
    padding: 4,
  },
  selectVideoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2A',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF9800',
    borderStyle: 'dashed',
    gap: 10,
  },
  selectVideoText: {
    color: '#FF9800',
    fontSize: 15,
    fontWeight: '600',
  },
  changeVideoButton: {
    alignItems: 'center',
    marginTop: 12,
  },
  changeVideoText: {
    color: '#2196F3',
    fontSize: 14,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    gap: 10,
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1E1E1E',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  videoList: {
    padding: 16,
  },
  videoOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  videoOptionSelected: {
    backgroundColor: '#FF980020',
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  videoOptionText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  videoOptionTextSelected: {
    color: '#FF9800',
    fontWeight: '600',
  },
});
