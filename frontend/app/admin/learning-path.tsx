import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiService } from '../../src/utils/api';

interface Video {
  id: string;
  title: string;
  duration: number;
  categories: string[];
}

interface PathItem {
  video_id: string;
  order: number;
  is_path_exclusive: boolean;
  video?: Video;
}

export default function LearningPathEditor() {
  const [allVideos, setAllVideos] = useState<Video[]>([]);
  const [pathItems, setPathItems] = useState<PathItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showVideoSelector, setShowVideoSelector] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [videos, path] = await Promise.all([
        apiService.getVideos(),
        apiService.getLearningPath(),
      ]);
      setAllVideos(videos);
      setPathItems(path);
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'No se pudieron cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const addVideoToPath = (video: Video, isExclusive: boolean) => {
    // Check if already in path
    if (pathItems.some(item => item.video_id === video.id)) {
      Alert.alert('Aviso', 'Este video ya está en la ruta de aprendizaje');
      return;
    }

    const newItem: PathItem = {
      video_id: video.id,
      order: pathItems.length,
      is_path_exclusive: isExclusive,
      video: video,
    };
    setPathItems([...pathItems, newItem]);
    setShowVideoSelector(false);
  };

  const removeFromPath = (videoId: string) => {
    const updated = pathItems
      .filter(item => item.video_id !== videoId)
      .map((item, index) => ({ ...item, order: index }));
    setPathItems(updated);
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= pathItems.length) return;

    const newItems = [...pathItems];
    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
    setPathItems(newItems.map((item, idx) => ({ ...item, order: idx })));
  };

  const toggleExclusive = (videoId: string) => {
    setPathItems(pathItems.map(item => 
      item.video_id === videoId 
        ? { ...item, is_path_exclusive: !item.is_path_exclusive }
        : item
    ));
  };

  const savePath = async () => {
    setSaving(true);
    try {
      const items = pathItems.map(item => ({
        video_id: item.video_id,
        order: item.order,
        is_path_exclusive: item.is_path_exclusive,
      }));
      await apiService.updateLearningPath(items);
      Alert.alert('Éxito', 'Ruta de aprendizaje guardada');
    } catch (error) {
      console.error('Error saving path:', error);
      Alert.alert('Error', 'No se pudo guardar la ruta');
    } finally {
      setSaving(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getVideoById = (videoId: string): Video | undefined => {
    return allVideos.find(v => v.id === videoId);
  };

  const renderPathItem = ({ item, index }: { item: PathItem; index: number }) => {
    const video = item.video || getVideoById(item.video_id);
    if (!video) return null;

    return (
      <View style={styles.pathCard}>
        <View style={styles.orderControls}>
          <TouchableOpacity
            style={[styles.orderBtn, index === 0 && styles.orderBtnDisabled]}
            onPress={() => moveItem(index, 'up')}
            disabled={index === 0}
          >
            <Ionicons name="chevron-up" size={18} color={index === 0 ? '#444' : '#fff'} />
          </TouchableOpacity>
          <Text style={styles.orderNumber}>{index + 1}</Text>
          <TouchableOpacity
            style={[styles.orderBtn, index === pathItems.length - 1 && styles.orderBtnDisabled]}
            onPress={() => moveItem(index, 'down')}
            disabled={index === pathItems.length - 1}
          >
            <Ionicons name="chevron-down" size={18} color={index === pathItems.length - 1 ? '#444' : '#fff'} />
          </TouchableOpacity>
        </View>

        <Image
          source={{ uri: apiService.getVideoThumbnailUrl(video.id) }}
          style={styles.thumbnail}
        />

        <View style={styles.videoInfo}>
          <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
          <Text style={styles.videoDuration}>{formatDuration(video.duration || 0)}</Text>
        </View>

        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => removeFromPath(item.video_id)}
        >
          <Ionicons name="trash-outline" size={20} color="#F44336" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderVideoSelector = ({ item }: { item: Video }) => {
    const isInPath = pathItems.some(p => p.video_id === item.id);
    
    return (
      <TouchableOpacity
        style={[styles.selectorCard, isInPath && styles.selectorCardDisabled]}
        disabled={isInPath}
      >
        <Image
          source={{ uri: apiService.getVideoThumbnailUrl(item.id) }}
          style={styles.selectorThumbnail}
        />
        <View style={styles.selectorInfo}>
          <Text style={[styles.selectorTitle, isInPath && styles.selectorTitleDisabled]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.selectorDuration}>{formatDuration(item.duration || 0)}</Text>
        </View>
        {isInPath ? (
          <View style={styles.inPathBadge}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
          </View>
        ) : (
          <View style={styles.addButtons}>
            <TouchableOpacity
              style={[styles.addBtn, styles.addBtnPath]}
              onPress={() => addVideoToPath(item, false)}
            >
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Añadir a Path</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
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
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Editar Ruta de Aprendizaje</Text>
        <TouchableOpacity 
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]} 
          onPress={savePath}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Guardar</Text>
          )}
        </TouchableOpacity>
      </View>

      {showVideoSelector ? (
        <>
          {/* Video Selector */}
          <View style={styles.selectorHeader}>
            <Text style={styles.selectorHeaderTitle}>Seleccionar Video</Text>
            <TouchableOpacity onPress={() => setShowVideoSelector(false)}>
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={allVideos}
            renderItem={renderVideoSelector}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        </>
      ) : (
        <>
          {/* Info */}
          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color="#2196F3" />
            <Text style={styles.infoText}>
              Añade videos a la ruta de aprendizaje. Los estudiantes deben ver cada video en orden para desbloquear el siguiente.
            </Text>
          </View>

          {/* Path Items */}
          <FlatList
            data={pathItems}
            renderItem={renderPathItem}
            keyExtractor={(item) => item.video_id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="map-outline" size={64} color="#444" />
                <Text style={styles.emptyText}>Sin videos en la ruta</Text>
                <Text style={styles.emptySubtext}>
                  Añade videos para crear la ruta de aprendizaje
                </Text>
              </View>
            }
          />

          {/* Add Button */}
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setShowVideoSelector(true)}
          >
            <Ionicons name="add" size={32} color="#fff" />
          </TouchableOpacity>
        </>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  saveBtn: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#1A237E',
    margin: 16,
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  infoText: {
    flex: 1,
    color: '#B3E5FC',
    fontSize: 13,
    lineHeight: 20,
  },
  infoBold: {
    fontWeight: '700',
    color: '#fff',
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  pathCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  orderControls: {
    alignItems: 'center',
    marginRight: 12,
  },
  orderBtn: {
    padding: 4,
  },
  orderBtnDisabled: {
    opacity: 0.3,
  },
  orderNumber: {
    color: '#2196F3',
    fontSize: 16,
    fontWeight: '700',
    marginVertical: 4,
  },
  thumbnail: {
    width: 70,
    height: 50,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  videoInfo: {
    flex: 1,
    marginLeft: 12,
  },
  videoTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  videoDuration: {
    color: '#888',
    fontSize: 12,
    marginBottom: 6,
  },
  exclusiveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  exclusiveBtnActive: {
    backgroundColor: '#3E2723',
  },
  exclusiveText: {
    color: '#888',
    fontSize: 11,
  },
  exclusiveTextActive: {
    color: '#FF9800',
  },
  removeBtn: {
    padding: 10,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
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
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
  selectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  selectorHeaderTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  selectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  selectorCardDisabled: {
    opacity: 0.5,
  },
  selectorThumbnail: {
    width: 80,
    height: 56,
    borderRadius: 6,
    backgroundColor: '#333',
  },
  selectorInfo: {
    flex: 1,
    marginLeft: 12,
  },
  selectorTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  selectorTitleDisabled: {
    color: '#666',
  },
  selectorDuration: {
    color: '#888',
    fontSize: 12,
  },
  inPathBadge: {
    padding: 8,
  },
  addButtons: {
    gap: 6,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  addBtnNormal: {
    backgroundColor: '#2196F3',
  },
  addBtnPath: {
    backgroundColor: '#E91E63',
  },
  addBtnExclusive: {
    backgroundColor: '#FF9800',
  },
  addBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
});
