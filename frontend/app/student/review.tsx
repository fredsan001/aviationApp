import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Video as ExpoVideo, ResizeMode, Audio } from 'expo-av';
import { useAppStore } from '../../src/store/appStore';
import { apiService } from '../../src/utils/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const VIDEO_HEIGHT = SCREEN_HEIGHT * 0.65;

interface WatchedVideo {
  id: string;
  title: string;
  duration: number;
  watched_at?: string;
}

export default function ReviewScreen() {
  const { accessCode } = useAppStore();
  const [videos, setVideos] = useState<WatchedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [repeatCount, setRepeatCount] = useState(1);
  const [currentRepeat, setCurrentRepeat] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoMode, setIsAutoMode] = useState(false);
  
  const flatListRef = useRef<FlatList>(null);
  const videoRefs = useRef<{ [key: string]: ExpoVideo | null }>({});

  useEffect(() => {
    fetchWatchedVideos();
    setupAudio();
  }, []);

  const setupAudio = async () => {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: true,
    });
  };

  const fetchWatchedVideos = async () => {
    if (!accessCode) return;
    try {
      const watched = await apiService.getWatchedVideos(accessCode);
      // Sort by watch date (most recent first or maintain order)
      setVideos(watched);
    } catch (error) {
      console.error('Error fetching watched videos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVideoEnd = useCallback(() => {
    if (!isAutoMode) return;

    if (currentRepeat < repeatCount) {
      // Repeat current video
      setCurrentRepeat(prev => prev + 1);
      const currentVideo = videoRefs.current[videos[currentIndex]?.id];
      if (currentVideo) {
        currentVideo.replayAsync();
      }
    } else {
      // Move to next video
      if (currentIndex < videos.length - 1) {
        setCurrentRepeat(1);
        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      } else {
        // Finished all videos
        setIsAutoMode(false);
        setIsPlaying(false);
      }
    }
  }, [isAutoMode, currentRepeat, repeatCount, currentIndex, videos]);

  const startAutoReview = () => {
    setIsAutoMode(true);
    setIsPlaying(true);
    setCurrentIndex(0);
    setCurrentRepeat(1);
    flatListRef.current?.scrollToIndex({ index: 0, animated: true });
  };

  const stopAutoReview = () => {
    setIsAutoMode(false);
    setIsPlaying(false);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderVideo = ({ item, index }: { item: WatchedVideo; index: number }) => {
    const isActive = index === currentIndex;
    const videoUrl = apiService.getVideoStreamUrl(item.id);

    return (
      <View style={styles.videoContainer}>
        <View style={styles.videoHeader}>
          <View style={styles.videoNumberBadge}>
            <Text style={styles.videoNumber}>{index + 1}</Text>
          </View>
          <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
          <Text style={styles.videoDuration}>{formatDuration(item.duration || 0)}</Text>
        </View>

        <View style={styles.videoWrapper}>
          {Platform.OS !== 'web' ? (
            <ExpoVideo
              ref={(ref) => { videoRefs.current[item.id] = ref; }}
              source={{ uri: videoUrl }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={isActive && isPlaying}
              isLooping={false}
              onPlaybackStatusUpdate={(status) => {
                if (status.isLoaded && status.didJustFinish && isActive) {
                  handleVideoEnd();
                }
              }}
              useNativeControls={!isAutoMode}
            />
          ) : (
            <video
              src={videoUrl}
              style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
              controls={!isAutoMode}
              autoPlay={isActive && isPlaying}
              onEnded={isActive ? handleVideoEnd : undefined}
            />
          )}
        </View>

        {isAutoMode && isActive && (
          <View style={styles.repeatIndicator}>
            <Text style={styles.repeatText}>
              Repetición {currentRepeat} de {repeatCount}
            </Text>
          </View>
        )}
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
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Repaso</Text>
        <View style={styles.headerRight}>
          <Text style={styles.videoCount}>{videos.length} videos</Text>
        </View>
      </View>

      {videos.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="play-circle-outline" size={80} color="#444" />
          <Text style={styles.emptyTitle}>Sin videos vistos</Text>
          <Text style={styles.emptySubtitle}>
            Mira algunos videos primero para poder repasarlos
          </Text>
        </View>
      ) : (
        <>
          {/* Control Panel */}
          <View style={styles.controlPanel}>
            <View style={styles.repeatSelector}>
              <Text style={styles.repeatLabel}>Repetir cada video:</Text>
              <View style={styles.repeatButtons}>
                {[1, 2, 3].map((count) => (
                  <TouchableOpacity
                    key={count}
                    style={[
                      styles.repeatBtn,
                      repeatCount === count && styles.repeatBtnActive,
                    ]}
                    onPress={() => setRepeatCount(count)}
                    disabled={isAutoMode}
                  >
                    <Text
                      style={[
                        styles.repeatBtnText,
                        repeatCount === count && styles.repeatBtnTextActive,
                      ]}
                    >
                      {count}x
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.startBtn, isAutoMode && styles.stopBtn]}
              onPress={isAutoMode ? stopAutoReview : startAutoReview}
            >
              <Ionicons
                name={isAutoMode ? 'stop' : 'play'}
                size={20}
                color="#fff"
              />
              <Text style={styles.startBtnText}>
                {isAutoMode ? 'Detener' : 'Iniciar Repaso'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Progress */}
          {isAutoMode && (
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${((currentIndex + 1) / videos.length) * 100}%` },
                ]}
              />
              <Text style={styles.progressText}>
                Video {currentIndex + 1} de {videos.length}
              </Text>
            </View>
          )}

          {/* Video List */}
          <FlatList
            ref={flatListRef}
            data={videos}
            renderItem={renderVideo}
            keyExtractor={(item) => item.id}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.y / VIDEO_HEIGHT);
              if (!isAutoMode) {
                setCurrentIndex(index);
              }
            }}
            getItemLayout={(data, index) => ({
              length: VIDEO_HEIGHT,
              offset: VIDEO_HEIGHT * index,
              index,
            })}
            scrollEnabled={!isAutoMode}
          />
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
  headerRight: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  videoCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  controlPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1A1A2E',
  },
  repeatSelector: {
    flex: 1,
  },
  repeatLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  repeatButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  repeatBtn: {
    width: 44,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
  },
  repeatBtnActive: {
    backgroundColor: '#E91E63',
  },
  repeatBtnText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  repeatBtnTextActive: {
    color: '#fff',
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  stopBtn: {
    backgroundColor: '#F44336',
  },
  startBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  progressBar: {
    height: 24,
    backgroundColor: '#2A2A2A',
    position: 'relative',
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#E91E63',
  },
  progressText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    zIndex: 1,
  },
  videoContainer: {
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
  },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1E1E1E',
    gap: 10,
  },
  videoNumberBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E91E63',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoNumber: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  videoTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  videoDuration: {
    color: '#888',
    fontSize: 12,
  },
  videoWrapper: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
  repeatIndicator: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  repeatText: {
    backgroundColor: 'rgba(233, 30, 99, 0.9)',
    color: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    fontSize: 14,
    fontWeight: '600',
  },
});
