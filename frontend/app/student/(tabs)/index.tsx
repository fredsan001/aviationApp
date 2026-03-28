import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useAppStore } from '../../../src/store/appStore';
import { apiService } from '../../../src/utils/api';
import { Video, Category } from '../../../src/types';

interface VideoWithProgress extends Video {
  watched_count?: number;
  completed?: boolean;
  last_position?: number;
  ready_for_evaluation?: boolean;
  path_order?: number;
  is_path_exclusive?: boolean;
}

export default function StudentVideos() {
  const [videos, setVideos] = useState<VideoWithProgress[]>([]);
  const [pathVideos, setPathVideos] = useState<VideoWithProgress[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [watchedVideoIds, setWatchedVideoIds] = useState<Set<string>>(new Set());
  const [progressMap, setProgressMap] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<'all' | 'path'>('all');
  
  const { clientName, accessCode } = useAppStore();

  // Special categories (Row 1)
  const specialCategories = [
    { id: '__watched__', name: 'Vistos', icon: 'eye', color: '#4CAF50' },
    { id: '__unwatched__', name: 'No Vistos', icon: 'eye-off', color: '#FF9800' },
    { id: '__ready__', name: 'A Evaluar', icon: 'school', color: '#9C27B0' },
  ];

  // Regular categories (Row 2)
  const regularCategories = [
    { id: 'all', name: 'Todos' },
    ...categories
  ];

  // Displayed videos based on view mode
  const displayedVideos = viewMode === 'path' 
    ? pathVideos
    : videos.filter(v => {
        // In "All" mode, hide videos that are path_exclusive
        const pathItem = pathVideos.find(pv => pv.id === v.id);
        return !pathItem?.is_path_exclusive;
      });

  const fetchData = async () => {
    try {
      // Fetch all categories first
      const categoriesData = await apiService.getCategories();
      setCategories(categoriesData);
      
      // Also fetch watched videos and progress to mark them
      let watchedIds = new Set<string>();
      let progressData = new Map<string, any>();
      
      if (accessCode) {
        const watched = await apiService.getWatchedVideos(accessCode);
        watchedIds = new Set(watched.map((v: VideoWithProgress) => v.id));
        setWatchedVideoIds(watchedIds);
        
        // Get full progress for ready_for_evaluation status
        const progress = await apiService.getProgress(accessCode);
        progress.forEach((p: any) => {
          progressData.set(p.video_id, p);
        });
        setProgressMap(progressData);
        
        // Fetch learning path videos
        try {
          const pathData = await apiService.getLearningPathVideos(accessCode);
          setPathVideos(pathData);
        } catch (e) {
          console.log('No learning path configured');
          setPathVideos([]);
        }
      }
      
      // Handle special categories
      if (selectedCategory === '__watched__') {
        const watchedVideos = await apiService.getWatchedVideos(accessCode);
        // Merge progress data
        const videosWithProgress = watchedVideos.map((v: VideoWithProgress) => ({
          ...v,
          ready_for_evaluation: progressData.get(v.id)?.ready_for_evaluation || false
        }));
        setVideos(videosWithProgress);
      } else if (selectedCategory === '__unwatched__') {
        // Fetch all videos and filter out watched ones
        const allVideos = await apiService.getVideos();
        const unwatchedVideos = allVideos.filter((v: Video) => !v.is_processing && !watchedIds.has(v.id));
        setVideos(unwatchedVideos);
      } else if (selectedCategory === '__ready__') {
        // Videos marked as ready for evaluation
        const allVideos = await apiService.getVideos();
        const readyVideos = allVideos.filter((v: Video) => {
          const progress = progressData.get(v.id);
          return progress?.ready_for_evaluation === true;
        }).map((v: Video) => ({
          ...v,
          ready_for_evaluation: true
        }));
        setVideos(readyVideos);
      } else {
        const videosData = await apiService.getVideos(selectedCategory || undefined);
        const videosWithProgress = videosData
          .filter((v: Video) => !v.is_processing)
          .map((v: Video) => ({
            ...v,
            ready_for_evaluation: progressData.get(v.id)?.ready_for_evaluation || false
          }));
        setVideos(videosWithProgress);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [selectedCategory, accessCode])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleReadyForEvaluation = async (videoId: string, currentState: boolean) => {
    if (!accessCode) return;
    
    try {
      await apiService.updateProgress(accessCode, videoId, {
        ready_for_evaluation: !currentState
      });
      
      // Update local state
      setVideos(prev => prev.map(v => 
        v.id === videoId ? { ...v, ready_for_evaluation: !currentState } : v
      ));
      
      // Update progress map
      setProgressMap(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(videoId) || {};
        newMap.set(videoId, { ...existing, ready_for_evaluation: !currentState });
        return newMap;
      });
    } catch (error) {
      console.error('Error updating ready status:', error);
    }
  };

  const renderVideo = ({ item, index }: { item: VideoWithProgress; index: number }) => {
    const thumbnailUrl = apiService.getVideoThumbnailUrl(item.id);
    const isWatched = watchedVideoIds.has(item.id) || item.watched_count && item.watched_count > 0;
    const isReady = item.ready_for_evaluation || progressMap.get(item.id)?.ready_for_evaluation;
    
    return (
      <TouchableOpacity
        style={styles.videoCard}
        onPress={() => router.push({ pathname: '/student/player', params: { id: item.id } })}
        activeOpacity={0.8}
      >
        <View style={styles.videoThumbnail}>
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.thumbnailImage}
            resizeMode="cover"
          />
          <View style={styles.playIconOverlay}>
            <Ionicons name="play-circle" size={48} color="rgba(255,255,255,0.9)" />
          </View>
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </View>
          {isWatched && (
            <View style={styles.watchedBadge}>
              <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
              <Text style={styles.watchedText}>Visto</Text>
            </View>
          )}
          {viewMode === 'path' && (
            <View style={styles.pathOrderBadge}>
              <Text style={styles.pathOrderText}>{index + 1}</Text>
            </View>
          )}
        </View>
        <View style={styles.videoInfo}>
          <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.videoCategory}>{item.category}</Text>
          <View style={styles.videoMeta}>
            {item.subtitles && item.subtitles.length > 0 && (
              <View style={styles.subtitleBadge}>
                <Ionicons name="text" size={12} color="#4CAF50" />
                <Text style={styles.subtitleCount}>{item.subtitles.length} segmentos</Text>
              </View>
            )}
            {item.watched_count && item.watched_count > 0 && (
              <View style={styles.watchCountBadge}>
                <Ionicons name="eye" size={12} color="#2196F3" />
                <Text style={styles.watchCountText}>{item.watched_count}x</Text>
              </View>
            )}
          </View>
          
          {/* Ready for Evaluation Checkbox */}
          <TouchableOpacity
            style={[styles.readyCheckbox, isReady && styles.readyCheckboxActive]}
            onPress={(e) => {
              e.stopPropagation();
              toggleReadyForEvaluation(item.id, isReady || false);
            }}
          >
            <View style={[styles.checkbox, isReady && styles.checkboxChecked]}>
              {isReady && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <Text style={[styles.readyLabel, isReady && styles.readyLabelActive]}>
              Listo para evaluación
            </Text>
          </TouchableOpacity>
        </View>
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
        <View>
          <Text style={styles.welcomeText}>Bienvenido, {clientName}</Text>
          <Text style={styles.subtitleText}>Practica tu inglés aeronáutico</Text>
        </View>
        <TouchableOpacity
          style={styles.iconButton}
          onPress={() => router.push('/student/favorites')}
        >
          <Ionicons name="heart" size={24} color="#F44336" />
        </TouchableOpacity>
      </View>

      {/* View Mode Selector */}
      <View style={styles.viewModeContainer}>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'all' && styles.viewModeButtonActive]}
          onPress={() => setViewMode('all')}
        >
          <Ionicons name="grid" size={18} color={viewMode === 'all' ? '#fff' : '#888'} />
          <Text style={[styles.viewModeText, viewMode === 'all' && styles.viewModeTextActive]}>Todos</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'path' && styles.viewModeButtonActive]}
          onPress={() => setViewMode('path')}
        >
          <Ionicons name="navigate" size={18} color={viewMode === 'path' ? '#fff' : '#888'} />
          <Text style={[styles.viewModeText, viewMode === 'path' && styles.viewModeTextActive]}>Path</Text>
        </TouchableOpacity>
      </View>

      {/* Special Categories (Row 1) */}
      <View style={styles.specialCategoriesRow}>
        {specialCategories.map((item) => {
          const isActive = selectedCategory === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.specialCategoryChip,
                item.id === '__watched__' && styles.watchedChip,
                item.id === '__watched__' && isActive && styles.watchedChipActive,
                item.id === '__unwatched__' && styles.unwatchedChip,
                item.id === '__unwatched__' && isActive && styles.unwatchedChipActive,
                item.id === '__ready__' && styles.readyChip,
                item.id === '__ready__' && isActive && styles.readyChipActive,
              ]}
              onPress={() => setSelectedCategory(isActive ? null : item.id)}
            >
              <Ionicons 
                name={item.icon as any} 
                size={14} 
                color={isActive ? '#fff' : item.color} 
              />
              <Text style={[
                styles.specialCategoryText,
                { color: isActive ? '#fff' : item.color }
              ]}>
                {item.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Regular Categories (Row 2) */}
      <View style={styles.categoriesContainer}>
        <FlatList
          horizontal
          data={regularCategories}
          renderItem={({ item }) => {
            const isActive = selectedCategory === item.name || (item.id === 'all' && !selectedCategory);
            
            return (
              <TouchableOpacity
                style={[
                  styles.categoryChip,
                  isActive && styles.categoryChipActive,
                ]}
                onPress={() => {
                  if (item.id === 'all') {
                    setSelectedCategory(null);
                  } else {
                    setSelectedCategory(item.name);
                  }
                }}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    isActive && styles.categoryChipTextActive,
                  ]}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesList}
        />
      </View>

      {/* Videos */}
      <FlatList
        data={displayedVideos}
        renderItem={renderVideo}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.videosList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2196F3"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons 
              name={selectedCategory === '__watched__' ? "eye-off-outline" : "videocam-off-outline"} 
              size={64} 
              color="#444" 
            />
            <Text style={styles.emptyText}>
              {selectedCategory === '__watched__' 
                ? 'No has visto ningún video aún' 
                : 'No hay videos disponibles'}
            </Text>
            <Text style={styles.emptySubtext}>
              {selectedCategory === '__watched__'
                ? 'Los videos que veas aparecerán aquí'
                : 'Vuelve más tarde para nuevo contenido'}
            </Text>
          </View>
        }
      />
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  welcomeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  subtitleText: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  iconButton: {
    padding: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
  },
  viewModeContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 4,
  },
  viewModeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  viewModeButtonActive: {
    backgroundColor: '#2196F3',
  },
  viewModeText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  viewModeTextActive: {
    color: '#fff',
  },
  specialCategoriesRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  specialCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  specialCategoryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  categoriesContainer: {
    marginBottom: 8,
  },
  categoriesList: {
    paddingHorizontal: 16,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    marginRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryChipActive: {
    backgroundColor: '#2196F3',
  },
  categoryChipText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  videosList: {
    padding: 16,
  },
  videoCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  videoThumbnail: {
    height: 180,
    backgroundColor: '#2A2A2A',
    position: 'relative',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#2A2A2A',
  },
  playIconOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  durationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  videoInfo: {
    padding: 12,
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
  },
  subtitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtitleCount: {
    color: '#4CAF50',
    fontSize: 12,
  },
  videoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 12,
  },
  watchedBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  watchedText: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
  },
  watchCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  watchCountText: {
    color: '#2196F3',
    fontSize: 12,
  },
  pathOrderBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E91E63',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pathOrderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  watchedChip: {
    backgroundColor: '#1E3D1F',
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  watchedChipActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  watchedChipText: {
    color: '#4CAF50',
  },
  unwatchedChip: {
    backgroundColor: '#3D2F1F',
    borderWidth: 1,
    borderColor: '#FF9800',
  },
  unwatchedChipActive: {
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
  },
  unwatchedChipText: {
    color: '#FF9800',
  },
  readyChip: {
    backgroundColor: '#2D1F3D',
    borderWidth: 1,
    borderColor: '#9C27B0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  readyChipActive: {
    backgroundColor: '#9C27B0',
    borderColor: '#9C27B0',
  },
  readyChipText: {
    color: '#9C27B0',
  },
  readyCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  readyCheckboxActive: {
    backgroundColor: '#2D1F3D',
    borderColor: '#9C27B0',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#666',
    marginRight: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#9C27B0',
    borderColor: '#9C27B0',
  },
  readyLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  },
  readyLabelActive: {
    color: '#9C27B0',
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
});
