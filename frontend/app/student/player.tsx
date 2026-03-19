import React, { useState, useEffect, useRef } from 'react';
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
import { Audio, Video as ExpoVideo, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useAppStore } from '../../src/store/appStore';
import { apiService } from '../../src/utils/api';
import { Video, Subtitle } from '../../src/types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIDEO_HEIGHT = 220;

// Web Video Component using HTML5 video element
const WebVideoPlayer = ({ 
  videoUrl, 
  onTimeUpdate, 
  onDurationChange,
  onPlayingChange,
  onLoad,
  onError,
  videoRef,
}: {
  videoUrl: string;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onLoad: () => void;
  onError: (error: any) => void;
  videoRef: React.RefObject<HTMLVideoElement>;
}) => {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => onTimeUpdate(video.currentTime);
    const handleDurationChange = () => onDurationChange(video.duration || 0);
    const handlePlay = () => onPlayingChange(true);
    const handlePause = () => onPlayingChange(false);
    const handleLoadedData = () => {
      onLoad();
      onDurationChange(video.duration || 0);
    };
    const handleError = (e: any) => onError(e);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleLoadedData);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleLoadedData);
      video.removeEventListener('error', handleError);
    };
  }, [videoUrl]);

  return (
    <video
      ref={videoRef as any}
      src={videoUrl}
      style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
      playsInline
      preload="auto"
    />
  );
};

export default function VideoPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const expoVideoRef = useRef<ExpoVideo>(null);
  const webVideoRef = useRef<HTMLVideoElement>(null);
  
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoLoading, setVideoLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentSubtitle, setCurrentSubtitle] = useState<Subtitle | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [videoError, setVideoError] = useState<string | null>(null);
  
  // A-B Repeat state
  const [loopStart, setLoopStart] = useState<number | null>(null);
  const [loopEnd, setLoopEnd] = useState<number | null>(null);
  const [isLooping, setIsLooping] = useState(false);
  
  const { accessCode } = useAppStore();
  const isWeb = Platform.OS === 'web';

  // Setup audio mode for mobile
  useEffect(() => {
    if (!isWeb) {
      Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });
    }
  }, []);

  useEffect(() => {
    fetchVideo();
    fetchProgress();
  }, [id]);

  // Update subtitle based on current time
  useEffect(() => {
    if (video?.subtitles && video.subtitles.length > 0) {
      const subtitle = video.subtitles.find(
        s => currentTime >= s.start_time && currentTime <= s.end_time
      );
      setCurrentSubtitle(subtitle || null);
    }
  }, [currentTime, video]);

  // Handle A-B loop for web
  useEffect(() => {
    if (isWeb && isLooping && loopStart !== null && loopEnd !== null) {
      if (currentTime >= loopEnd) {
        seekTo(loopStart);
      }
    }
  }, [currentTime, isLooping, loopStart, loopEnd, isWeb]);

  const fetchVideo = async () => {
    try {
      const data = await apiService.getVideo(id!);
      setVideo(data);
      setDuration(data.duration || 0);
    } catch (error) {
      Alert.alert('Error', 'No se pudo cargar el video');
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

  const handleExpoPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      if (status.error) {
        console.error('Expo video error:', status.error);
        setVideoError(status.error);
      }
      return;
    }
    
    setVideoLoading(false);
    setVideoError(null);
    setPlaying(status.isPlaying);
    setCurrentTime(status.positionMillis / 1000);
    
    if (status.durationMillis) {
      setDuration(status.durationMillis / 1000);
    }
    
    // Handle A-B loop
    if (isLooping && loopStart !== null && loopEnd !== null) {
      const currentPos = status.positionMillis / 1000;
      if (currentPos >= loopEnd) {
        expoVideoRef.current?.setPositionAsync(loopStart * 1000);
      }
    }
  };

  const togglePlay = async () => {
    if (isWeb) {
      const video = webVideoRef.current;
      if (!video) return;
      if (playing) {
        video.pause();
      } else {
        try {
          await video.play();
        } catch (e) {
          console.error('Play error:', e);
        }
      }
    } else {
      if (!expoVideoRef.current) return;
      try {
        if (playing) {
          await expoVideoRef.current.pauseAsync();
        } else {
          await expoVideoRef.current.playAsync();
        }
      } catch (e) {
        console.error('Play error:', e);
      }
    }
  };

  const seekTo = async (time: number) => {
    const safeTime = Math.max(0, Math.min(time, duration));
    if (isWeb) {
      const video = webVideoRef.current;
      if (video) {
        video.currentTime = safeTime;
      }
    } else {
      if (expoVideoRef.current) {
        try {
          await expoVideoRef.current.setPositionAsync(safeTime * 1000);
        } catch (e) {
          console.error('Seek error:', e);
        }
      }
    }
  };

  const setSpeed = async (rate: number) => {
    if (isWeb) {
      const video = webVideoRef.current;
      if (video) {
        video.playbackRate = rate;
      }
    } else {
      if (expoVideoRef.current) {
        try {
          await expoVideoRef.current.setRateAsync(rate, true);
        } catch (e) {
          console.error('Rate error:', e);
        }
      }
    }
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
        Alert.alert('Error', 'El punto B debe estar después del punto A');
      }
    }
  };

  const toggleLoop = () => {
    if (loopStart === null || loopEnd === null) {
      Alert.alert('Configurar Loop', 'Primero establece los puntos A (inicio) y B (fin)');
      return;
    }
    setIsLooping(!isLooping);
    if (!isLooping) {
      seekTo(loopStart);
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
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading || !video) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Cargando video...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const videoUrl = apiService.getVideoStreamUrl(video.id);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{video.title}</Text>
          <TouchableOpacity style={styles.favoriteBtn} onPress={toggleFavorite}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={24}
              color={isFavorite ? '#F44336' : '#fff'}
            />
          </TouchableOpacity>
        </View>

        {/* Video Player */}
        <View style={styles.videoWrapper}>
          <View style={styles.videoContainer}>
            {isWeb ? (
              <WebVideoPlayer
                videoUrl={videoUrl}
                videoRef={webVideoRef}
                onTimeUpdate={setCurrentTime}
                onDurationChange={setDuration}
                onPlayingChange={setPlaying}
                onLoad={() => setVideoLoading(false)}
                onError={(e) => {
                  console.error('Web video error:', e);
                  setVideoError('Error al cargar el video');
                }}
              />
            ) : (
              <ExpoVideo
                ref={expoVideoRef}
                source={{ uri: videoUrl }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={false}
                isLooping={false}
                useNativeControls={false}
                onPlaybackStatusUpdate={handleExpoPlaybackStatusUpdate}
                onLoad={(status) => {
                  console.log('Video loaded:', status);
                  setVideoLoading(false);
                  if ('durationMillis' in status && status.durationMillis) {
                    setDuration(status.durationMillis / 1000);
                  }
                }}
                onError={(error) => {
                  console.error('Video load error:', error);
                  setVideoError('Error al cargar el video');
                  setVideoLoading(false);
                }}
                onReadyForDisplay={() => {
                  console.log('Video ready for display');
                  setVideoLoading(false);
                }}
              />
            )}
            
            {/* Video Loading Overlay */}
            {videoLoading && !videoError && (
              <View style={styles.videoOverlay}>
                <ActivityIndicator size="large" color="#2196F3" />
                <Text style={styles.loadingVideoText}>Cargando...</Text>
              </View>
            )}

            {/* Error Overlay */}
            {videoError && (
              <View style={styles.videoOverlay}>
                <Ionicons name="alert-circle" size={48} color="#F44336" />
                <Text style={styles.errorText}>{videoError}</Text>
                <TouchableOpacity 
                  style={styles.retryButton}
                  onPress={() => {
                    setVideoError(null);
                    setVideoLoading(true);
                    // Force reload
                    if (expoVideoRef.current) {
                      expoVideoRef.current.unloadAsync().then(() => {
                        expoVideoRef.current?.loadAsync({ uri: videoUrl });
                      });
                    }
                  }}
                >
                  <Text style={styles.retryText}>Reintentar</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {/* Play/Pause Overlay Button */}
            {!videoLoading && !videoError && !playing && (
              <TouchableOpacity style={styles.videoOverlayButton} onPress={togglePlay}>
                <View style={styles.playOverlay}>
                  <Ionicons name="play" size={40} color="#fff" />
                </View>
              </TouchableOpacity>
            )}

            {/* Tap to pause when playing */}
            {!videoLoading && !videoError && playing && (
              <TouchableOpacity 
                style={styles.videoOverlayButton} 
                onPress={togglePlay}
                activeOpacity={1}
              />
            )}
          </View>
          
          {/* Subtitle Display */}
          {currentSubtitle && (
            <View style={[styles.subtitleContainer, isLooping && styles.subtitleLooping]}>
              <Text style={styles.subtitleText}>{currentSubtitle.text}</Text>
            </View>
          )}
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <TouchableOpacity
            style={styles.progressBar}
            activeOpacity={0.9}
            onPress={(e) => {
              const { locationX } = e.nativeEvent;
              const barWidth = SCREEN_WIDTH - 32;
              const progress = Math.max(0, Math.min(1, locationX / barWidth));
              seekTo(progress * duration);
            }}
          >
            <View style={[styles.progressFill, { width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }]} />
            {loopStart !== null && duration > 0 && (
              <View style={[styles.loopMarker, styles.loopMarkerA, { left: `${(loopStart / duration) * 100}%` }]} />
            )}
            {loopEnd !== null && duration > 0 && (
              <View style={[styles.loopMarker, styles.loopMarkerB, { left: `${(loopEnd / duration) * 100}%` }]} />
            )}
          </TouchableOpacity>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Main Controls */}
        <View style={styles.mainControls}>
          <TouchableOpacity style={styles.controlBtn} onPress={() => seekTo(Math.max(0, currentTime - 5))}>
            <Ionicons name="play-back" size={28} color="#fff" />
            <Text style={styles.controlLabel}>-5s</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
            <Ionicons name={playing ? 'pause' : 'play'} size={36} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.controlBtn} onPress={() => seekTo(Math.min(duration, currentTime + 5))}>
            <Ionicons name="play-forward" size={28} color="#fff" />
            <Text style={styles.controlLabel}>+5s</Text>
          </TouchableOpacity>
        </View>

        {/* Speed Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Velocidad</Text>
          <View style={styles.speedRow}>
            {[0.5, 0.75, 1.0, 1.25, 1.5].map((rate) => (
              <TouchableOpacity
                key={rate}
                style={[styles.speedBtn, playbackRate === rate && styles.speedBtnActive]}
                onPress={() => setSpeed(rate)}
              >
                <Text style={[styles.speedText, playbackRate === rate && styles.speedTextActive]}>
                  {rate}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* A-B Loop Controls */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Repetición A-B</Text>
          <View style={styles.loopRow}>
            <TouchableOpacity
              style={[styles.loopBtn, loopStart !== null && styles.loopBtnActive]}
              onPress={() => setLoopPoint('start')}
            >
              <Text style={styles.loopBtnText}>A</Text>
              {loopStart !== null && <Text style={styles.loopTime}>{formatTime(loopStart)}</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.loopBtn, loopEnd !== null && styles.loopBtnActive]}
              onPress={() => setLoopPoint('end')}
            >
              <Text style={styles.loopBtnText}>B</Text>
              {loopEnd !== null && <Text style={styles.loopTime}>{formatTime(loopEnd)}</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.loopToggle, isLooping && styles.loopToggleActive]}
              onPress={toggleLoop}
            >
              <Ionicons name="repeat" size={20} color={isLooping ? '#fff' : '#888'} />
              <Text style={[styles.loopToggleText, isLooping && styles.loopToggleTextActive]}>
                {isLooping ? 'Activo' : 'Repetir'}
              </Text>
            </TouchableOpacity>
            
            {(loopStart !== null || loopEnd !== null) && (
              <TouchableOpacity style={styles.clearBtn} onPress={clearLoop}>
                <Ionicons name="close-circle" size={24} color="#F44336" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Subtitle Segments */}
        {video.subtitles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Segmentos ({video.subtitles.length})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subtitleScroll}>
              {video.subtitles.map((subtitle) => (
                <TouchableOpacity
                  key={subtitle.id}
                  style={[styles.subtitleChip, currentSubtitle?.id === subtitle.id && styles.subtitleChipActive]}
                  onPress={() => jumpToSubtitle(subtitle)}
                >
                  <Text style={styles.subtitleChipTime}>{formatTime(subtitle.start_time)}</Text>
                  <Text style={styles.subtitleChipText} numberOfLines={2}>
                    {subtitle.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Video Info */}
        <View style={styles.infoSection}>
          <Text style={styles.videoTitle}>{video.title}</Text>
          <Text style={styles.videoCategory}>{video.category}</Text>
          {video.description ? (
            <Text style={styles.videoDescription}>{video.description}</Text>
          ) : null}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginHorizontal: 12,
  },
  favoriteBtn: {
    padding: 8,
  },
  videoWrapper: {
    backgroundColor: '#000',
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  videoContainer: {
    width: '100%',
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  loadingVideoText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: '#F44336',
    marginTop: 12,
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  videoOverlayButton: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOverlay: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(33,150,243,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
  subtitleContainer: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 12,
  },
  subtitleLooping: {
    borderTopWidth: 2,
    borderTopColor: '#FF9800',
  },
  subtitleText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 22,
  },
  progressSection: {
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
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: '#888',
    fontSize: 13,
  },
  mainControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    gap: 32,
  },
  controlBtn: {
    alignItems: 'center',
    padding: 8,
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
  section: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  speedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  speedBtn: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    alignItems: 'center',
  },
  speedBtnActive: {
    backgroundColor: '#2196F3',
  },
  speedText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  speedTextActive: {
    color: '#fff',
  },
  loopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loopBtn: {
    width: 60,
    height: 52,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loopBtnActive: {
    backgroundColor: '#4CAF50',
  },
  loopBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loopTime: {
    color: '#fff',
    fontSize: 10,
  },
  loopToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E1E1E',
    paddingVertical: 14,
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
  clearBtn: {
    padding: 8,
  },
  subtitleScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  subtitleChip: {
    backgroundColor: '#1E1E1E',
    padding: 10,
    borderRadius: 8,
    marginRight: 8,
    width: 140,
  },
  subtitleChipActive: {
    backgroundColor: '#2196F3',
  },
  subtitleChipTime: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitleChipText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
  },
  infoSection: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1E1E1E',
  },
  videoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  videoCategory: {
    color: '#2196F3',
    fontSize: 14,
    marginBottom: 8,
  },
  videoDescription: {
    color: '#888',
    fontSize: 14,
    lineHeight: 20,
  },
  bottomPadding: {
    height: 40,
  },
});
