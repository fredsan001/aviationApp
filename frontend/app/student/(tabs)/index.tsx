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

export default function StudentVideos() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const { clientName } = useAppStore();

  const fetchData = async () => {
    try {
      const [videosData, categoriesData] = await Promise.all([
        apiService.getVideos(selectedCategory || undefined),
        apiService.getCategories(),
      ]);
      setVideos(videosData.filter((v: Video) => !v.is_processing));
      setCategories(categoriesData);
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
    }, [selectedCategory])
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

  const renderVideo = ({ item }: { item: Video }) => {
    const thumbnailUrl = apiService.getVideoThumbnailUrl(item.id);
    
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
        </View>
        <View style={styles.videoInfo}>
          <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.videoCategory}>{item.category}</Text>
          {item.subtitles.length > 0 && (
            <View style={styles.subtitleBadge}>
              <Ionicons name="text" size={12} color="#4CAF50" />
              <Text style={styles.subtitleCount}>{item.subtitles.length} segmentos</Text>
            </View>
          )}
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

      {/* Categories */}
      {categories.length > 0 && (
        <View style={styles.categoriesContainer}>
          <FlatList
            horizontal
            data={[{ id: 'all', name: 'Todos' }, ...categories]}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.categoryChip,
                  (item.id === 'all' && !selectedCategory) || selectedCategory === item.name
                    ? styles.categoryChipActive
                    : null,
                ]}
                onPress={() => setSelectedCategory(item.id === 'all' ? null : item.name)}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    (item.id === 'all' && !selectedCategory) || selectedCategory === item.name
                      ? styles.categoryChipTextActive
                      : null,
                  ]}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesList}
          />
        </View>
      )}

      {/* Videos */}
      <FlatList
        data={videos}
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
            <Ionicons name="videocam-off-outline" size={64} color="#444" />
            <Text style={styles.emptyText}>No hay videos disponibles</Text>
            <Text style={styles.emptySubtext}>Vuelve más tarde para nuevo contenido</Text>
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
    marginTop: 8,
    gap: 4,
  },
  subtitleCount: {
    color: '#4CAF50',
    fontSize: 12,
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
