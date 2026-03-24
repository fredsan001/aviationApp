import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { apiService } from '../../src/utils/api';
import { Video } from '../../src/types';

export default function ManageVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchVideos = async () => {
    try {
      const data = await apiService.getVideos();
      setVideos(data);
    } catch (error) {
      console.error('Error fetching videos:', error);
      Alert.alert('Error', 'Failed to load videos');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchVideos();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchVideos();
  };

  const handleDelete = (video: Video) => {
    if (Platform.OS === 'web') {
      // Use confirm for web
      const confirmed = window.confirm(`¿Estás seguro de que deseas eliminar "${video.title}"?`);
      if (confirmed) {
        performDelete(video);
      }
    } else {
      Alert.alert(
        'Eliminar Video',
        `¿Estás seguro de que deseas eliminar "${video.title}"?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: () => performDelete(video),
          },
        ]
      );
    }
  };

  const performDelete = async (video: Video) => {
    try {
      await apiService.deleteVideo(video.id);
      setVideos(videos.filter(v => v.id !== video.id));
      if (Platform.OS === 'web') {
        window.alert('Video eliminado exitosamente');
      } else {
        Alert.alert('Éxito', 'Video eliminado');
      }
    } catch (error) {
      console.error('Delete error:', error);
      if (Platform.OS === 'web') {
        window.alert('Error al eliminar el video');
      } else {
        Alert.alert('Error', 'No se pudo eliminar el video');
      }
    }
  };

  const handleRetranscribe = async (video: Video) => {
    Alert.alert(
      'Re-transcribe Video',
      'This will regenerate subtitles using AI. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Transcribe',
          onPress: async () => {
            try {
              await apiService.retranscribeVideo(video.id);
              Alert.alert('Success', 'Re-transcription started');
              fetchVideos();
            } catch (error) {
              Alert.alert('Error', 'Failed to start re-transcription');
            }
          },
        },
      ]
    );
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderVideo = ({ item }: { item: Video }) => {
    // Calculate processing time if video is being processed
    const getProcessingTime = () => {
      if (!item.is_processing) return null;
      const createdAt = new Date(item.created_at);
      const now = new Date();
      const diffMs = now.getTime() - createdAt.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Iniciando...';
      if (diffMins < 60) return `${diffMins} min transcurridos`;
      const diffHours = Math.floor(diffMins / 60);
      return `${diffHours}h ${diffMins % 60}min transcurridos`;
    };

    return (
      <View style={styles.videoCard}>
        <View style={styles.videoThumbnail}>
          <Ionicons name="videocam" size={32} color="#fff" />
          {item.is_processing && (
            <View style={styles.processingBadge}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
          )}
        </View>
        <View style={styles.videoInfo}>
          <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.videoCategory}>{item.category}</Text>
          <View style={styles.videoMeta}>
            <Text style={styles.videoDuration}>{formatDuration(item.duration)}</Text>
            <Text style={styles.videoSubtitles}>
              {item.subtitles?.length || 0} subtítulos
            </Text>
          </View>
          {item.is_processing && (
            <View style={styles.processingInfo}>
              <Text style={styles.processingText}>{item.processing_status}</Text>
              <Text style={styles.processingTime}>{getProcessingTime()}</Text>
            </View>
          )}
        </View>
        <View style={styles.videoActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push({ pathname: '/admin/edit-video', params: { id: item.id } })}
          >
            <Ionicons name="pencil" size={20} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleRetranscribe(item)}
          >
            <Ionicons name="refresh" size={20} color="#FF9800" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash" size={20} color="#F44336" />
          </TouchableOpacity>
        </View>
      </View>
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
      <FlatList
        data={videos}
        renderItem={renderVideo}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2196F3"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="videocam-off" size={64} color="#444" />
            <Text style={styles.emptyText}>No videos yet</Text>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => router.push('/admin/upload')}
            >
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.uploadButtonText}>Upload Video</Text>
            </TouchableOpacity>
          </View>
        }
      />
      {videos.length > 0 && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => router.push('/admin/upload')}
        >
          <Ionicons name="add" size={32} color="#fff" />
        </TouchableOpacity>
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
  listContent: {
    padding: 16,
  },
  videoCard: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  videoThumbnail: {
    width: 100,
    height: 100,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: 4,
  },
  videoInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  videoTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  videoCategory: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  videoMeta: {
    flexDirection: 'row',
    gap: 12,
  },
  videoDuration: {
    color: '#666',
    fontSize: 12,
  },
  videoSubtitles: {
    color: '#4CAF50',
    fontSize: 12,
  },
  processingInfo: {
    marginTop: 4,
  },
  processingText: {
    color: '#FF9800',
    fontSize: 12,
  },
  processingTime: {
    color: '#888',
    fontSize: 11,
    marginTop: 2,
  },
  videoActions: {
    justifyContent: 'center',
    paddingRight: 8,
    gap: 4,
  },
  actionButton: {
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
    marginBottom: 24,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
