import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAppStore } from '../../src/store/appStore';
import { apiService } from '../../src/utils/api';
import { Video, Subtitle } from '../../src/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function VideoPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSubtitle, setCurrentSubtitle] = useState<Subtitle | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  
  // A-B Repeat state
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  
  const { accessCode } = useAppStore();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize video player
  const videoUrl = video ? apiService.getVideoStreamUrl(video.id) : '';
  const player = useVideoPlayer(videoUrl, (player) => {
    player.loop = false;
    player.playbackRate = playbackRate;
  });

  useEffect(() => {
    fetchVideo();
    fetchProgress();
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [id]);

  // Time tracking effect
  useEffect(() => {
    if (player && video) {
      timerRef.current = setInterval(() => {
        const time = player.currentTime;
        setCurrentTime(time);
        setDuration(player.duration || video.duration || 0);
        setPlaying(player.playing);
        
        // Update current subtitle
        if (video?.subtitles) {
          const subtitle = video.subtitles.find(
            s => time >= s.start_time && time <= s.end_time
          );
          setCurrentSubtitle(subtitle || null);
        }
        
        // Handle A-B loop
        if (isLooping && loopStart !== null && loopEnd !== null) {
          if (time >= loopEnd) {
            player.currentTime = loopStart;
          }
        }
      }, 100);
      
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [player, video, isLooping, loopStart, loopEnd]);

  const fetchVideo = async () => {
    try {
      const data = await apiService.getVideo(id!);
      setVideo(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load video');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const fetchProgress = async () => {
    if (!accessCode) return;
    try {
      const progress = await apiService.getProgress(accessCode);
      const videoProgress = progress.find((p: any) => p.video_id === id);
      if (videoProgress) {
        setIsFavorite(videoProgress.is_favorite);
      }
    } catch (error) {
      console.error('Error fetching progress:', error);
    }
  };

  const togglePlay = () => {
    if (!player) return;
    if (playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const seekTo = (time: number) => {
    if (!player) return;
    player.currentTime = time;
  };

  const setSpeed = (rate: number) => {
    if (!player) return;
    player.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const toggleFavorite = async () => {
    if (!accessCode) return;
    try {
      await apiService.updateProgress(accessCode, id!, { is_favorite: !isFavorite });
      setIsFavorite(!isFavorite);
    } catch (error) {
      console.error('Error toggling favorite:', error);
    }
  };

  const setLoopPoint = (type: 'start' | 'end') => {
    if (type === 'start') {
      setLoopStart(currentTime);
      if (loopEnd !== null && currentTime >= loopEnd) {
        setLoopEnd(null);
      }
    } else {
      if (loopStart !== null && currentTime > loopStart) {
        setLoopEnd(currentTime);
      } else {
        Alert.alert('Error', 'End point must be after start point');
      }
    }
  };

  const toggleLoop = () => {
    if (loopStart === null || loopEnd === null) {
      Alert.alert('Set Loop Points', 'Please set both A (start) and B (end) points first');
      return;
    }
    setIsLooping(!isLooping);
    if (!isLooping && player) {
      player.currentTime = loopStart;
    }
  };

  const clearLoop = () => {
    setLoopStart(null);
    setLoopEnd(null);
    setIsLooping(false);
  };

  const jumpToSubtitle = (subtitle: Subtitle) => {
    seekTo(subtitle.start_time);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading || !video) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Back Button */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Video Player */}
      <View style={styles.videoContainer}>
        {player && (
          <VideoView
            player={player}
            style={styles.video}
            contentFit="contain"
            nativeControls={false}
          />
        )}
        
        {/* Subtitle Display */}
        {currentSubtitle && (
          <View style={[styles.subtitleContainer, isLooping && styles.subtitleLooping]}>
            <Text style={styles.subtitleText}>{currentSubtitle.text}</Text>
          </View>
        )}
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <TouchableOpacity
          style={styles.progressBar}
          onPress={(e) => {
            const { locationX } = e.nativeEvent;
            const progress = locationX / (SCREEN_WIDTH - 32);
            seekTo(progress * duration);
          }}
        >
          <View style={[styles.progressFill, { width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }]} />
          {loopStart !== null && duration > 0 && (
            <View
              style={[
                styles.loopMarker,
                styles.loopMarkerA,
                { left: `${(loopStart / duration) * 100}%` },
              ]}
            />
          )}
          {loopEnd !== null && duration > 0 && (
            <View
              style={[
                styles.loopMarker,
                styles.loopMarkerB,
                { left: `${(loopEnd / duration) * 100}%` },
              ]}
            />
          )}
        </TouchableOpacity>
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
          <Text style={styles.timeText}>{formatTime(duration)}</Text>
        </View>
      </View>

      {/* Main Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlButton} onPress={() => seekTo(Math.max(0, currentTime - 5))}>
          <Ionicons name="play-back" size={28} color="#fff" />
          <Text style={styles.controlLabel}>-5s</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
          <Ionicons name={playing ? 'pause' : 'play'} size={36} color="#fff" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.controlButton} onPress={() => seekTo(Math.min(duration, currentTime + 5))}>
          <Ionicons name="play-forward" size={28} color="#fff" />
          <Text style={styles.controlLabel}>+5s</Text>
        </TouchableOpacity>
      </View>

      {/* Loop Controls */}
      <View style={styles.loopControls}>
        <TouchableOpacity
          style={[styles.loopButton, loopStart !== null && styles.loopButtonActive]}
          onPress={() => setLoopPoint('start')}
        >
          <Text style={styles.loopButtonText}>A</Text>
          {loopStart !== null && <Text style={styles.loopTimeText}>{formatTime(loopStart)}</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.loopButton, loopEnd !== null && styles.loopButtonActive]}
          onPress={() => setLoopPoint('end')}
        >
          <Text style={styles.loopButtonText}>B</Text>
          {loopEnd !== null && <Text style={styles.loopTimeText}>{formatTime(loopEnd)}</Text>}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.loopToggle, isLooping && styles.loopToggleActive]}
          onPress={toggleLoop}
        >
          <Ionicons name="repeat" size={24} color={isLooping ? '#fff' : '#888'} />
          <Text style={[styles.loopToggleText, isLooping && styles.loopToggleTextActive]}>
            {isLooping ? 'Looping' : 'Loop A-B'}
          </Text>
        </TouchableOpacity>
        
        {(loopStart !== null || loopEnd !== null) && (
          <TouchableOpacity style={styles.clearButton} onPress={clearLoop}>
            <Ionicons name="close-circle" size={24} color="#F44336" />
          </TouchableOpacity>
        )}
      </View>

      {/* Speed & Favorite */}
      <View style={styles.extraControls}>
        <View style={styles.speedControls}>
          {[0.5, 0.75, 1.0, 1.25, 1.5].map((rate) => (
            <TouchableOpacity
              key={rate}
              style={[styles.speedButton, playbackRate === rate && styles.speedButtonActive]}
              onPress={() => setSpeed(rate)}
            >
              <Text style={[styles.speedText, playbackRate === rate && styles.speedTextActive]}>
                {rate}x
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        
        <TouchableOpacity style={styles.favoriteButton} onPress={toggleFavorite}>
          <Ionicons
            name={isFavorite ? 'heart' : 'heart-outline'}
            size={28}
            color={isFavorite ? '#F44336' : '#888'}
          />
        </TouchableOpacity>
      </View>

      {/* Subtitle List */}
      {video.subtitles.length > 0 && (
        <View style={styles.subtitleList}>
          <Text style={styles.subtitleListTitle}>Segments ({video.subtitles.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {video.subtitles.map((subtitle, index) => (
              <TouchableOpacity
                key={subtitle.id}
                style={[
                  styles.subtitleChip,
                  currentSubtitle?.id === subtitle.id && styles.subtitleChipActive,
                ]}
                onPress={() => jumpToSubtitle(subtitle)}
              >
                <Text style={styles.subtitleChipTime}>{formatTime(subtitle.start_time)}</Text>
                <Text style={styles.subtitleChipText} numberOfLines={1}>
                  {subtitle.text.substring(0, 30)}...
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  videoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 9 / 16,
    backgroundColor: '#000',
    marginTop: 50,
  },
  video: {
    flex: 1,
  },
  subtitleContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 12,
    borderRadius: 8,
  },
  subtitleLooping: {
    borderColor: '#FF9800',
    borderWidth: 2,
  },
  subtitleText: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '500',
  },
  progressContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  loopMarker: {
    position: 'absolute',
    top: -4,
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  loopMarkerA: {
    backgroundColor: '#4CAF50',
  },
  loopMarkerB: {
    backgroundColor: '#F44336',
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: '#888',
    fontSize: 12,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 32,
  },
  controlButton: {
    alignItems: 'center',
  },
  controlLabel: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loopControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  loopButton: {
    width: 60,
    height: 48,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loopButtonActive: {
    backgroundColor: '#4CAF50',
  },
  loopButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loopTimeText: {
    color: '#fff',
    fontSize: 10,
  },
  loopToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  loopToggleActive: {
    backgroundColor: '#FF9800',
  },
  loopToggleText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  loopToggleTextActive: {
    color: '#fff',
  },
  clearButton: {
    padding: 8,
  },
  extraControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  speedControls: {
    flexDirection: 'row',
    gap: 8,
  },
  speedButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 6,
  },
  speedButtonActive: {
    backgroundColor: '#2196F3',
  },
  speedText: {
    color: '#888',
    fontSize: 14,
  },
  speedTextActive: {
    color: '#fff',
  },
  favoriteButton: {
    padding: 8,
  },
  subtitleList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  subtitleListTitle: {
    color: '#888',
    fontSize: 14,
    marginBottom: 12,
  },
  subtitleChip: {
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    minWidth: 120,
  },
  subtitleChipActive: {
    backgroundColor: '#2196F3',
  },
  subtitleChipTime: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
  },
  subtitleChipText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 4,
  },
});
