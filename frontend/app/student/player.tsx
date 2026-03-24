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
const VIDEO_HEIGHT = 180;

// Web Video Component
const WebVideoPlayer = ({ 
  videoUrl, 
  onTimeUpdate, 
  onDurationChange,
  onPlayingChange,
  onLoad,
  onError,
  onEnded,
  videoRef,
  autoPlay,
}: {
  videoUrl: string;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onLoad: () => void;
  onError: (error: any) => void;
  onEnded?: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  autoPlay?: boolean;
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
      if (autoPlay) {
        video.play().catch(e => console.log('Autoplay blocked:', e));
      }
    };
    const handleError = (e: any) => onError(e);
    const handleEnded = () => {
      onPlayingChange(false);
      if (onEnded) onEnded();
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleLoadedData);
    video.addEventListener('error', handleError);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleLoadedData);
      video.removeEventListener('error', handleError);
      video.removeEventListener('ended', handleEnded);
    };
  }, [videoUrl, autoPlay, onEnded]);

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
  const [autoPlayReady, setAutoPlayReady] = useState(false);
  
  // Segment repeat state
  const [selectedSegment, setSelectedSegment] = useState<Subtitle | null>(null);
  
  // Subtitle language state
  const [subtitleLanguage, setSubtitleLanguage] = useState<'en' | 'es'>('en');
  const [translating, setTranslating] = useState(false);
  
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

  // Handle segment repeat
  useEffect(() => {
    if (selectedSegment && currentTime >= selectedSegment.end_time) {
      seekTo(selectedSegment.start_time);
    }
  }, [currentTime, selectedSegment]);

  // Auto-play when video is ready
  useEffect(() => {
    if (autoPlayReady && !videoLoading && !videoError) {
      togglePlay();
      setAutoPlayReady(false);
    }
  }, [autoPlayReady, videoLoading, videoError]);

  const fetchVideo = async () => {
    try {
      const data = await apiService.getVideo(id!);
      setVideo(data);
      setDuration(data.duration || 0);
      setAutoPlayReady(true); // Enable autoplay
    } catch (error) {
      Alert.alert('Error', 'No se pudo cargar el video');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const translateSubtitles = async () => {
    if (!video || translating) return;
    
    setTranslating(true);
    try {
      await apiService.translateSubtitles(video.id, 'es');
      const updatedVideo = await apiService.getVideo(video.id);
      setVideo(updatedVideo);
      Alert.alert('Éxito', 'Subtítulos traducidos al español');
    } catch (error: any) {
      console.error('Translation error:', error);
      Alert.alert('Error', 'No se pudieron traducir los subtítulos');
    } finally {
      setTranslating(false);
    }
  };

  const getCurrentSubtitleText = () => {
    if (!currentSubtitle) return null;
    
    if (subtitleLanguage === 'es' && video?.subtitles_translated) {
      const translated = (video as any).subtitles_translated?.find(
        (s: any) => s.id === currentSubtitle.id
      );
      if (translated?.text_translated) {
        return translated.text_translated;
      }
    }
    return currentSubtitle.text;
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

    // Mark as watched when video finishes
    if (status.didJustFinish) {
      markAsWatched();
    }
  };

  // Mark video as watched
  const markAsWatched = async () => {
    if (!accessCode || !id) return;
    try {
      await apiService.updateProgress(accessCode, id, { 
        watched_count: 1,
        completed: true 
      });
      console.log('Video marked as watched');
    } catch (error) {
      console.error('Error marking video as watched:', error);
    }
  };

  // Handle web video ended
  const handleWebVideoEnded = () => {
    setPlaying(false);
    markAsWatched();
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

  const handleSegmentPress = (subtitle: Subtitle) => {
    if (selectedSegment?.id === subtitle.id) {
      // Deselect segment
      setSelectedSegment(null);
    } else {
      // Select segment and jump to it
      setSelectedSegment(subtitle);
      seekTo(subtitle.start_time);
      if (!playing) {
        togglePlay();
      }
    }
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
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{video.title}</Text>
          <TouchableOpacity style={styles.favoriteBtn} onPress={toggleFavorite}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={22}
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
                onEnded={markAsWatched}
                autoPlay={true}
              />
            ) : (
              <ExpoVideo
                ref={expoVideoRef}
                source={{ uri: videoUrl }}
                style={styles.video}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay={true}
                isLooping={false}
                useNativeControls={false}
                onPlaybackStatusUpdate={handleExpoPlaybackStatusUpdate}
                onLoad={(status) => {
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
              />
            )}
            
            {videoLoading && !videoError && (
              <View style={styles.videoOverlay}>
                <ActivityIndicator size="large" color="#2196F3" />
              </View>
            )}

            {videoError && (
              <View style={styles.videoOverlay}>
                <Ionicons name="alert-circle" size={40} color="#F44336" />
                <Text style={styles.errorText}>{videoError}</Text>
                <TouchableOpacity 
                  style={styles.retryButton}
                  onPress={() => {
                    setVideoError(null);
                    setVideoLoading(true);
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
          </View>
          
          {/* Subtitle Display */}
          {currentSubtitle && (
            <View style={[styles.subtitleContainer, selectedSegment && styles.subtitleLooping]}>
              <Text style={styles.subtitleText}>{getCurrentSubtitleText()}</Text>
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
            {selectedSegment && duration > 0 && (
              <>
                <View style={[styles.loopMarker, styles.loopMarkerA, { left: `${(selectedSegment.start_time / duration) * 100}%` }]} />
                <View style={[styles.loopMarker, styles.loopMarkerB, { left: `${(selectedSegment.end_time / duration) * 100}%` }]} />
              </>
            )}
          </TouchableOpacity>
          <View style={styles.timeRow}>
            <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>
        </View>

        {/* Main Controls - Compact */}
        <View style={styles.mainControls}>
          <TouchableOpacity style={styles.controlBtn} onPress={() => seekTo(Math.max(0, currentTime - 5))}>
            <Ionicons name="play-back" size={20} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.playButton} onPress={togglePlay}>
            <Ionicons name={playing ? 'pause' : 'play'} size={28} color="#fff" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.controlBtn} onPress={() => seekTo(Math.min(duration, currentTime + 5))}>
            <Ionicons name="play-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Speed Controls - Compact */}
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

        {/* Subtitle Language Controls */}
        {video && video.subtitles && video.subtitles.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Idioma</Text>
            <View style={styles.languageRow}>
              <TouchableOpacity
                style={[styles.langBtn, subtitleLanguage === 'en' && styles.langBtnActive]}
                onPress={() => setSubtitleLanguage('en')}
              >
                <Text style={[styles.langText, subtitleLanguage === 'en' && styles.langTextActive]}>
                  English
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.langBtn, 
                  subtitleLanguage === 'es' && styles.langBtnActive,
                  !(video as any).subtitles_translated && styles.langBtnDisabled
                ]}
                onPress={() => {
                  if ((video as any).subtitles_translated) {
                    setSubtitleLanguage('es');
                  } else {
                    Alert.alert(
                      'Traducir',
                      '¿Traducir subtítulos al español?',
                      [
                        { text: 'No', style: 'cancel' },
                        { text: 'Sí', onPress: translateSubtitles }
                      ]
                    );
                  }
                }}
                disabled={translating}
              >
                {translating ? (
                  <ActivityIndicator size="small" color="#2196F3" />
                ) : (
                  <Text style={[
                    styles.langText, 
                    subtitleLanguage === 'es' && styles.langTextActive,
                  ]}>
                    Español
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Segments - Tap to repeat */}
        {video.subtitles.length > 0 && (
          <View style={styles.section}>
            <View style={styles.segmentHeader}>
              <Text style={styles.sectionTitle}>Segmentos ({video.subtitles.length})</Text>
              {selectedSegment && (
                <TouchableOpacity onPress={() => setSelectedSegment(null)}>
                  <Text style={styles.stopRepeatText}>Detener repetición</Text>
                </TouchableOpacity>
              )}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subtitleScroll}>
              {video.subtitles.map((subtitle) => (
                <TouchableOpacity
                  key={subtitle.id}
                  style={[
                    styles.subtitleChip, 
                    currentSubtitle?.id === subtitle.id && styles.subtitleChipCurrent,
                    selectedSegment?.id === subtitle.id && styles.subtitleChipSelected
                  ]}
                  onPress={() => handleSegmentPress(subtitle)}
                >
                  <View style={styles.chipHeader}>
                    <Text style={styles.subtitleChipTime}>{formatTime(subtitle.start_time)}</Text>
                    {selectedSegment?.id === subtitle.id && (
                      <Ionicons name="repeat" size={12} color="#FF9800" />
                    )}
                  </View>
                  <Text style={styles.subtitleChipText} numberOfLines={2}>
                    {subtitle.text}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
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
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButton: {
    padding: 6,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 8,
  },
  favoriteBtn: {
    padding: 6,
  },
  videoWrapper: {
    backgroundColor: '#000',
    marginHorizontal: 12,
    borderRadius: 10,
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
  errorText: {
    color: '#F44336',
    marginTop: 8,
    fontSize: 13,
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryText: {
    color: '#fff',
    fontSize: 13,
  },
  subtitleContainer: {
    backgroundColor: 'rgba(0,0,0,0.9)',
    padding: 10,
  },
  subtitleLooping: {
    borderTopWidth: 2,
    borderTopColor: '#FF9800',
  },
  subtitleText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
  },
  progressSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#333',
    borderRadius: 3,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 3,
  },
  loopMarker: {
    position: 'absolute',
    top: -3,
    width: 3,
    height: 12,
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
    marginTop: 4,
  },
  timeText: {
    color: '#888',
    fontSize: 11,
  },
  mainControls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 20,
  },
  controlBtn: {
    padding: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
  },
  playButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  speedRow: {
    flexDirection: 'row',
    gap: 6,
  },
  speedBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 6,
    alignItems: 'center',
  },
  speedBtnActive: {
    backgroundColor: '#2196F3',
  },
  speedText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  speedTextActive: {
    color: '#fff',
  },
  languageRow: {
    flexDirection: 'row',
    gap: 8,
  },
  langBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#1E1E1E',
    borderRadius: 6,
    alignItems: 'center',
  },
  langBtnActive: {
    backgroundColor: '#2196F3',
  },
  langBtnDisabled: {
    borderWidth: 1,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  langText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  langTextActive: {
    color: '#fff',
  },
  segmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stopRepeatText: {
    color: '#FF9800',
    fontSize: 12,
    fontWeight: '600',
  },
  subtitleScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  subtitleChip: {
    backgroundColor: '#1E1E1E',
    padding: 8,
    borderRadius: 6,
    marginRight: 8,
    width: 130,
  },
  subtitleChipCurrent: {
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  subtitleChipSelected: {
    backgroundColor: '#2A2A2A',
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  chipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  subtitleChipTime: {
    color: '#4CAF50',
    fontSize: 10,
    fontWeight: '600',
  },
  subtitleChipText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
  },
});
