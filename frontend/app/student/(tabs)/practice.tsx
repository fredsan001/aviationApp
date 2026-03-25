import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useAppStore } from '../../../src/store/appStore';
import { apiService } from '../../../src/utils/api';

// ============== Types ==============

interface Scenario {
  id: string;
  name: string;
  description: string;
  phase: string;
  airport: string;
  atc_facility: string;
  frequency: string;
}

interface Message {
  id: string;
  type: 'pilot' | 'atc';
  text: string;
  timestamp: Date;
}

interface ListeningSegment {
  video_id: string;
  video_title: string;
  subtitle_id: string;
  start_time: number;
  end_time: number;
  text: string;
  stream_url: string;
}

type PracticeMode = 'menu' | 'simulator' | 'listening';

// ============== Helper Functions ==============

const getPhaseColor = (phase: string) => {
  switch (phase) {
    case 'ground': return '#4CAF50';
    case 'departure': return '#2196F3';
    case 'enroute': return '#9C27B0';
    case 'arrival': return '#FF9800';
    case 'pattern': return '#00BCD4';
    case 'emergency': return '#F44336';
    default: return '#888';
  }
};

const getPhaseIcon = (phase: string) => {
  switch (phase) {
    case 'ground': return 'car';
    case 'departure': return 'arrow-up';
    case 'enroute': return 'airplane';
    case 'arrival': return 'arrow-down';
    case 'pattern': return 'repeat';
    case 'emergency': return 'warning';
    default: return 'radio';
  }
};

// ============== Main Component ==============

export default function PracticeScreen() {
  const [mode, setMode] = useState<PracticeMode>('menu');
  const [loading, setLoading] = useState(false);
  
  // ATC Simulator State
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [inSimulation, setInSimulation] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pilotInput, setPilotInput] = useState('');
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<any>(null);
  const [showEvaluation, setShowEvaluation] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}`);

  // Listening Test State
  const [listeningSegment, setListeningSegment] = useState<ListeningSegment | null>(null);
  const [replayCount, setReplayCount] = useState(0);
  const [userResponse, setUserResponse] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [listeningResult, setListeningResult] = useState<any>(null);
  const [showListeningResult, setShowListeningResult] = useState(false);
  const [responseMode, setResponseMode] = useState<'text' | 'voice'>('text');
  const [isListeningRecording, setIsListeningRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const listeningRecordingRef = useRef<Audio.Recording | null>(null);
  
  const { accessCode } = useAppStore();
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    setupAudio();
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync();
    };
  }, []);

  useEffect(() => {
    if (mode === 'simulator') {
      fetchScenarios();
    }
  }, [mode]);

  const setupAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
        allowsRecordingIOS: true,
      });
    } catch (e) {
      console.error('Audio setup error:', e);
    }
  };

  // ============== ATC Simulator Functions ==============

  const fetchScenarios = async () => {
    setLoading(true);
    try {
      const data = await apiService.getATCScenarios();
      setScenarios(data);
    } catch (error) {
      console.error('Error fetching scenarios:', error);
      Alert.alert('Error', 'No se pudieron cargar los escenarios');
    } finally {
      setLoading(false);
    }
  };

  const requestMicPermission = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso al micrófono para grabar tu voz');
        return false;
      }
      return true;
    } catch (e) {
      console.error('Permission error:', e);
      return false;
    }
  };

  const startRecording = async () => {
    const hasPermission = await requestMicPermission();
    if (!hasPermission) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch (e) {
      console.error('Recording error:', e);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
    }
  };

  const stopRecording = async () => {
    if (!recordingRef.current) return '';
    
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      return uri || '';
    } catch (e) {
      console.error('Stop recording error:', e);
      return '';
    }
  };

  const evaluateTransmission = async (message: string) => {
    if (!selectedScenario || !message.trim()) return;
    
    setIsEvaluating(true);
    try {
      const result = await apiService.evaluatePilotTransmission(
        message,
        selectedScenario.id
      );
      setEvaluation(result);
      setShowEvaluation(true);
    } catch (error) {
      console.error('Evaluation error:', error);
      Alert.alert('Error', 'No se pudo evaluar la transmisión');
    } finally {
      setIsEvaluating(false);
    }
  };

  const startSimulation = async (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setInSimulation(true);
    setMessages([]);
    setIsReceiving(true);

    try {
      const initialContact = await apiService.getATCInitialContact(scenario.id);
      
      const atcMessage: Message = {
        id: `msg_${Date.now()}`,
        type: 'atc',
        text: initialContact.message,
        timestamp: new Date(),
      };
      setMessages([atcMessage]);

      if (initialContact.audio_base64) {
        await playATCAudio(initialContact.audio_base64);
      }
    } catch (error) {
      console.error('Error starting simulation:', error);
      Alert.alert('Error', 'No se pudo iniciar la simulación');
    } finally {
      setIsReceiving(false);
    }
  };

  const playATCAudio = async (base64Audio: string) => {
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: `data:audio/mp3;base64,${base64Audio}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsReceiving(false);
        }
      });
    } catch (e) {
      console.error('Error playing audio:', e);
      setIsReceiving(false);
    }
  };

  const sendPilotMessage = async () => {
    if (!pilotInput.trim() || !selectedScenario || isTransmitting || isReceiving) return;

    const pilotMessage: Message = {
      id: `msg_${Date.now()}`,
      type: 'pilot',
      text: pilotInput.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, pilotMessage]);
    setPilotInput('');
    setIsTransmitting(true);

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ])
    ).start();

    try {
      const response = await apiService.simulateATC(
        selectedScenario.id,
        pilotMessage.text,
        sessionId
      );

      setIsTransmitting(false);
      setIsReceiving(true);
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);

      const atcMessage: Message = {
        id: `msg_${Date.now()}`,
        type: 'atc',
        text: response.atc_response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, atcMessage]);

      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);

      if (response.audio_base64) {
        await playATCAudio(response.audio_base64);
      } else {
        setIsReceiving(false);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setIsTransmitting(false);
      setIsReceiving(false);
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      Alert.alert('Error', 'No se pudo enviar el mensaje');
    }
  };

  const endSimulation = async () => {
    if (selectedScenario) {
      try {
        await apiService.resetATCSession(sessionId, selectedScenario.id);
      } catch (e) {
        console.error('Error resetting session:', e);
      }
    }
    setInSimulation(false);
    setSelectedScenario(null);
    setMessages([]);
    if (soundRef.current) {
      await soundRef.current.stopAsync();
    }
  };

  // ============== Listening Test Functions ==============

  const loadRandomSegment = async () => {
    if (!accessCode) {
      Alert.alert('Error', 'Código de acceso no encontrado');
      return;
    }

    setLoading(true);
    try {
      const segment = await apiService.getRandomListeningSegment(accessCode, selectedLevel);
      setListeningSegment(segment);
      setReplayCount(0);
      setUserResponse('');
      setListeningResult(null);
      setShowListeningResult(false);
    } catch (error: any) {
      console.error('Error loading segment:', error);
      Alert.alert('Error', error.response?.data?.detail || 'No se pudo cargar el segmento de audio');
    } finally {
      setLoading(false);
    }
  };

  const playListeningSegment = async () => {
    if (!listeningSegment) return;

    setIsPlaying(true);
    setReplayCount(prev => prev + 1);

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const audioUrl = `${API_URL}${listeningSegment.stream_url}`;
      
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { 
          shouldPlay: false,
          positionMillis: listeningSegment.start_time * 1000,
        }
      );
      soundRef.current = sound;

      // Set up playback status update to stop at end_time
      const duration = (listeningSegment.end_time - listeningSegment.start_time) * 1000;
      
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          const currentPos = status.positionMillis;
          const startPos = listeningSegment.start_time * 1000;
          
          if (currentPos >= startPos + duration || status.didJustFinish) {
            sound.stopAsync();
            setIsPlaying(false);
          }
        }
      });

      await sound.playAsync();

      // Auto-stop after duration
      setTimeout(async () => {
        if (soundRef.current) {
          await soundRef.current.stopAsync();
          setIsPlaying(false);
        }
      }, duration + 500);

    } catch (e) {
      console.error('Error playing segment:', e);
      setIsPlaying(false);
      Alert.alert('Error', 'No se pudo reproducir el audio');
    }
  };

  // Voice recording for listening test
  const startListeningRecording = async () => {
    const hasPermission = await requestMicPermission();
    if (!hasPermission) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      // Use M4A format which is compatible with Whisper
      await recording.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      });
      await recording.startAsync();
      listeningRecordingRef.current = recording;
      setIsListeningRecording(true);
    } catch (e) {
      console.error('Recording error:', e);
      Alert.alert('Error', 'No se pudo iniciar la grabación');
    }
  };

  const stopListeningRecording = async () => {
    if (!listeningRecordingRef.current) return;
    
    setIsListeningRecording(false);
    setIsTranscribing(true);
    
    try {
      await listeningRecordingRef.current.stopAndUnloadAsync();
      const uri = listeningRecordingRef.current.getURI();
      listeningRecordingRef.current = null;
      
      if (uri) {
        // Transcribe the audio
        const result = await apiService.transcribeAudio(uri);
        if (result.transcription) {
          setUserResponse(result.transcription);
        }
      }
    } catch (e) {
      console.error('Stop recording error:', e);
      Alert.alert('Error', 'No se pudo procesar el audio');
    } finally {
      setIsTranscribing(false);
    }
  };

  const submitListeningResponse = async () => {
    if (!listeningSegment || !userResponse.trim()) {
      Alert.alert('Error', 'Por favor escribe lo que escuchaste');
      return;
    }

    if (!accessCode) {
      Alert.alert('Error', 'Código de acceso no encontrado');
      return;
    }

    setIsEvaluating(true);
    try {
      const result = await apiService.evaluateListeningTest(accessCode, {
        video_id: listeningSegment.video_id,
        subtitle_id: listeningSegment.subtitle_id,
        original_text: listeningSegment.text,
        user_response: userResponse.trim(),
        replay_count: replayCount,
      });
      
      setListeningResult(result);
      setShowListeningResult(true);
    } catch (error) {
      console.error('Error evaluating:', error);
      Alert.alert('Error', 'No se pudo evaluar la respuesta');
    } finally {
      setIsEvaluating(false);
    }
  };

  const exitListeningTest = () => {
    setListeningSegment(null);
    setReplayCount(0);
    setUserResponse('');
    setListeningResult(null);
    setShowListeningResult(false);
    setMode('menu');
    if (soundRef.current) {
      soundRef.current.stopAsync();
    }
  };

  // ============== Render Functions ==============

  // Main Menu Screen
  const renderMenu = () => (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.menuContent}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="school" size={40} color="#2196F3" />
          </View>
          <Text style={styles.title}>Centro de Práctica</Text>
          <Text style={styles.subtitle}>
            Mejora tus habilidades de comunicación aeronáutica
          </Text>
        </View>

        {/* ATC Simulator Card */}
        <TouchableOpacity
          style={styles.modeCard}
          onPress={() => setMode('simulator')}
          activeOpacity={0.8}
        >
          <View style={styles.modeIconContainer}>
            <View style={[styles.modeIcon, { backgroundColor: '#2196F320' }]}>
              <Ionicons name="radio" size={40} color="#2196F3" />
            </View>
          </View>
          <View style={styles.modeInfo}>
            <Text style={styles.modeTitle}>Simulador ATC</Text>
            <Text style={styles.modeDescription}>
              Practica comunicaciones de radio con un controlador ATC virtual impulsado por IA
            </Text>
          </View>
          <View style={styles.modeArrow}>
            <Ionicons name="chevron-forward" size={24} color="#888" />
          </View>
        </TouchableOpacity>

        {/* Listening Test Card */}
        <TouchableOpacity
          style={styles.modeCard}
          onPress={() => {
            setMode('listening');
            loadRandomSegment();
          }}
          activeOpacity={0.8}
        >
          <View style={styles.modeIconContainer}>
            <View style={[styles.modeIcon, { backgroundColor: '#FF980020' }]}>
              <Ionicons name="headset" size={40} color="#FF9800" />
            </View>
          </View>
          <View style={styles.modeInfo}>
            <Text style={styles.modeTitle}>Listening Test</Text>
            <Text style={styles.modeDescription}>
              Escucha segmentos de audio reales y transcribe lo que escuchas para evaluar tu comprensión
            </Text>
          </View>
          <View style={styles.modeArrow}>
            <Ionicons name="chevron-forward" size={24} color="#888" />
          </View>
        </TouchableOpacity>

        {/* Tips Section */}
        <View style={styles.tipsSection}>
          <Text style={styles.tipsTitle}>Consejos</Text>
          <View style={styles.tipCard}>
            <Ionicons name="bulb" size={20} color="#FF9800" />
            <Text style={styles.tipText}>
              Escucha atentamente y repite las transmisiones para mejorar
            </Text>
          </View>
          <View style={styles.tipCard}>
            <Ionicons name="repeat" size={20} color="#4CAF50" />
            <Text style={styles.tipText}>
              La práctica constante es clave para dominar la fraseología
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  // Listening Test Screen
  const renderListeningTest = () => (
    <SafeAreaView style={styles.listeningContainer} edges={['bottom']}>
      {/* Header */}
      <View style={styles.listeningHeader}>
        <TouchableOpacity onPress={exitListeningTest} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.listeningTitle}>Listening Test</Text>
        <View style={styles.replayBadge}>
          <Ionicons name="repeat" size={14} color="#FF9800" />
          <Text style={styles.replayCount}>{replayCount}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Cargando audio...</Text>
        </View>
      ) : listeningSegment ? (
        <ScrollView style={styles.listeningContent}>
          {/* Level Selector */}
          <View style={styles.levelSelectorContainer}>
            <Text style={styles.levelLabel}>Nivel de dificultad:</Text>
            <View style={styles.levelSelector}>
              {[1, 2, 3].map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.levelButton,
                    selectedLevel === level && styles.levelButtonActive
                  ]}
                  onPress={() => {
                    setSelectedLevel(level);
                    loadRandomSegment();
                  }}
                >
                  <Text style={[
                    styles.levelButtonText,
                    selectedLevel === level && styles.levelButtonTextActive
                  ]}>
                    {level}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.levelDescription}>
              {selectedLevel === 1 && '0-5 seg (Fácil)'}
              {selectedLevel === 2 && '5-10 seg (Intermedio)'}
              {selectedLevel === 3 && '10+ seg (Avanzado)'}
            </Text>
          </View>

          {/* Video Info */}
          <View style={styles.segmentInfo}>
            <Ionicons name="videocam" size={20} color="#888" />
            <Text style={styles.segmentTitle}>{listeningSegment.video_title}</Text>
            <View style={styles.durationBadgeSmall}>
              <Text style={styles.durationTextSmall}>{listeningSegment.duration}s</Text>
            </View>
          </View>

          {/* Audio Player */}
          <View style={styles.audioPlayerCard}>
            <Text style={styles.audioInstructions}>
              Escucha el audio y escribe lo que escuchas
            </Text>
            
            <TouchableOpacity
              style={[styles.playButton, isPlaying && styles.playButtonActive]}
              onPress={playListeningSegment}
              disabled={isPlaying}
            >
              <Ionicons 
                name={isPlaying ? "volume-high" : "play"} 
                size={32} 
                color="#fff" 
              />
              <Text style={styles.playButtonText}>
                {isPlaying ? 'Reproduciendo...' : 'Reproducir Audio'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.replayInfo}>
              Reproducciones: {replayCount} {replayCount === 1 ? 'vez' : 'veces'}
            </Text>
          </View>

          {/* Response Mode Selector */}
          <View style={styles.responseModeSelector}>
            <TouchableOpacity
              style={[styles.modeButton, responseMode === 'text' && styles.modeButtonActive]}
              onPress={() => setResponseMode('text')}
            >
              <Ionicons name="text" size={18} color={responseMode === 'text' ? '#fff' : '#888'} />
              <Text style={[styles.modeButtonText, responseMode === 'text' && styles.modeButtonTextActive]}>Texto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, responseMode === 'voice' && styles.modeButtonActive]}
              onPress={() => setResponseMode('voice')}
            >
              <Ionicons name="mic" size={18} color={responseMode === 'voice' ? '#fff' : '#888'} />
              <Text style={[styles.modeButtonText, responseMode === 'voice' && styles.modeButtonTextActive]}>Voz</Text>
            </TouchableOpacity>
          </View>

          {/* Response Input */}
          <View style={styles.responseSection}>
            <Text style={styles.responseLabel}>Tu transcripción:</Text>
            
            {responseMode === 'voice' ? (
              <View style={styles.voiceInputContainer}>
                {isTranscribing ? (
                  <View style={styles.transcribingContainer}>
                    <ActivityIndicator size="large" color="#9C27B0" />
                    <Text style={styles.transcribingText}>Transcribiendo...</Text>
                  </View>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.voiceRecordButton, isListeningRecording && styles.voiceRecordButtonActive]}
                      onPress={isListeningRecording ? stopListeningRecording : startListeningRecording}
                    >
                      <Text style={styles.pttButtonText}>
                        {isListeningRecording ? 'STOP' : 'PTT'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.voiceInstructions}>
                      {isListeningRecording ? 'Grabando... Toca para detener' : 'Push To Talk - Mantén presionado para grabar'}
                    </Text>
                  </>
                )}
                
                {userResponse.trim() && (
                  <View style={styles.transcriptionPreview}>
                    <Text style={styles.transcriptionPreviewLabel}>Transcripción:</Text>
                    <Text style={styles.transcriptionPreviewText}>{userResponse}</Text>
                  </View>
                )}
              </View>
            ) : (
              <TextInput
                style={styles.responseInput}
                value={userResponse}
                onChangeText={setUserResponse}
                placeholder="Escribe lo que escuchaste..."
                placeholderTextColor="#666"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            )}
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              (!userResponse.trim() || isEvaluating) && styles.submitButtonDisabled
            ]}
            onPress={submitListeningResponse}
            disabled={!userResponse.trim() || isEvaluating}
          >
            {isEvaluating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
                <Text style={styles.submitButtonText}>Enviar Respuesta</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Next Button */}
          <TouchableOpacity
            style={styles.nextButton}
            onPress={loadRandomSegment}
          >
            <Ionicons name="shuffle" size={20} color="#2196F3" />
            <Text style={styles.nextButtonText}>Siguiente Audio</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color="#F44336" />
          <Text style={styles.errorText}>No se pudo cargar el audio</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadRandomSegment}>
            <Text style={styles.retryButtonText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Result Modal */}
      {showListeningResult && listeningResult && (
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Text style={styles.resultTitle}>Resultado</Text>
              <TouchableOpacity onPress={() => setShowListeningResult(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Score Circle */}
            <View style={styles.scoreContainer}>
              <View style={[
                styles.scoreCircle,
                { borderColor: listeningResult.score >= 80 ? '#4CAF50' : listeningResult.score >= 60 ? '#FF9800' : '#F44336' }
              ]}>
                <Text style={styles.scoreValue}>{Math.round(listeningResult.score)}</Text>
                <Text style={styles.scoreLabel}>/ 100</Text>
              </View>
            </View>

            {/* Replay Count Info */}
            <View style={styles.replayResultInfo}>
              <Ionicons name="repeat" size={16} color="#FF9800" />
              <Text style={styles.replayResultText}>
                Reproducciones: {listeningResult.replay_count}
              </Text>
            </View>

            {/* Feedback */}
            <View style={styles.feedbackSection}>
              <Text style={styles.feedbackLabel}>Retroalimentación:</Text>
              <Text style={styles.feedbackText}>{listeningResult.feedback}</Text>
            </View>

            {/* Original Text */}
            <View style={styles.originalSection}>
              <Text style={styles.originalLabel}>Texto original:</Text>
              <Text style={styles.originalText}>{listeningResult.original_text}</Text>
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => {
                setShowListeningResult(false);
                loadRandomSegment();
              }}
            >
              <Text style={styles.continueButtonText}>Siguiente Audio</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );

  // ATC Simulator Scenario Selection
  const renderSimulatorScenarios = () => (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        {/* Header with Back Button */}
        <View style={styles.simulatorHeader}>
          <TouchableOpacity onPress={() => setMode('menu')} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.simulatorTitle}>Simulador ATC</Text>
        </View>

        {/* Aircraft Info */}
        <View style={styles.aircraftCard}>
          <View style={styles.aircraftIcon}>
            <Ionicons name="airplane" size={40} color="#2196F3" />
          </View>
          <View style={styles.aircraftInfo}>
            <Text style={styles.aircraftName}>Cessna 172 Skyhawk</Text>
            <Text style={styles.aircraftCallsign}>Callsign: N12345</Text>
          </View>
        </View>

        {/* Scenarios */}
        <Text style={styles.sectionTitle}>Selecciona un Escenario</Text>
        
        {loading ? (
          <ActivityIndicator size="large" color="#2196F3" style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.scenariosContainer}>
            {scenarios.map((scenario) => (
              <TouchableOpacity
                key={scenario.id}
                style={styles.scenarioCard}
                onPress={() => startSimulation(scenario)}
                activeOpacity={0.8}
              >
                <View style={styles.scenarioHeader}>
                  <View style={[styles.phaseIcon, { backgroundColor: getPhaseColor(scenario.phase) + '30' }]}>
                    <Ionicons 
                      name={getPhaseIcon(scenario.phase) as any} 
                      size={24} 
                      color={getPhaseColor(scenario.phase)} 
                    />
                  </View>
                  <View style={[styles.phaseBadge, { backgroundColor: getPhaseColor(scenario.phase) }]}>
                    <Text style={styles.phaseText}>{scenario.phase.toUpperCase()}</Text>
                  </View>
                </View>
                
                <Text style={styles.scenarioName}>{scenario.name}</Text>
                <Text style={styles.scenarioDescription}>{scenario.description}</Text>
                
                <View style={styles.scenarioDetails}>
                  <View style={styles.scenarioDetail}>
                    <Ionicons name="location" size={14} color="#888" />
                    <Text style={styles.scenarioDetailText}>{scenario.airport}</Text>
                  </View>
                  <View style={styles.scenarioDetail}>
                    <Ionicons name="radio-outline" size={14} color="#888" />
                    <Text style={styles.scenarioDetailText}>{scenario.frequency} MHz</Text>
                  </View>
                </View>

                <View style={styles.startButton}>
                  <Ionicons name="play" size={18} color="#fff" />
                  <Text style={styles.startButtonText}>Iniciar Simulación</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );

  // ATC Simulation View
  const renderSimulation = () => (
    <SafeAreaView style={styles.simulationContainer} edges={['bottom']}>
      {/* Cockpit Header */}
      <View style={styles.cockpitHeader}>
        <View style={styles.frequencyDisplay}>
          <Text style={styles.frequencyLabel}>COM1</Text>
          <Text style={styles.frequencyValue}>{selectedScenario?.frequency}</Text>
        </View>
        <View style={styles.facilityInfo}>
          <Text style={styles.facilityName}>{selectedScenario?.atc_facility}</Text>
          <Text style={styles.callsignText}>N12345</Text>
        </View>
        <TouchableOpacity style={styles.endButton} onPress={endSimulation}>
          <Ionicons name="close" size={24} color="#F44336" />
        </TouchableOpacity>
      </View>

      {/* Status Indicator */}
      <View style={styles.statusBar}>
        {isReceiving && (
          <View style={styles.statusIndicator}>
            <View style={[styles.statusDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.statusText}>RECEIVING...</Text>
          </View>
        )}
        {isTransmitting && (
          <Animated.View style={[styles.statusIndicator, { transform: [{ scale: pulseAnim }] }]}>
            <View style={[styles.statusDot, { backgroundColor: '#F44336' }]} />
            <Text style={styles.statusText}>TRANSMITTING...</Text>
          </Animated.View>
        )}
        {!isReceiving && !isTransmitting && (
          <View style={styles.statusIndicator}>
            <View style={[styles.statusDot, { backgroundColor: '#888' }]} />
            <Text style={styles.statusText}>STANDBY</Text>
          </View>
        )}
      </View>

      {/* Radio Log */}
      <ScrollView 
        ref={scrollViewRef}
        style={styles.radioLog}
        contentContainerStyle={styles.radioLogContent}
      >
        {messages.map((msg) => (
          <View 
            key={msg.id} 
            style={[
              styles.messageContainer,
              msg.type === 'pilot' ? styles.pilotMessage : styles.atcMessage
            ]}
          >
            <View style={styles.messageHeader}>
              <Text style={[
                styles.messageSender,
                { color: msg.type === 'pilot' ? '#4CAF50' : '#2196F3' }
              ]}>
                {msg.type === 'pilot' ? 'PILOT (N12345)' : selectedScenario?.atc_facility.toUpperCase()}
              </Text>
              <Text style={styles.messageTime}>
                {msg.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            <Text style={styles.messageText}>{msg.text}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Transmission Input */}
      <View style={styles.transmissionArea}>
        <TouchableOpacity
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={isTransmitting || isReceiving}
        >
          <Ionicons 
            name={isRecording ? "stop" : "mic-outline"} 
            size={22} 
            color={isRecording ? '#fff' : '#F44336'} 
          />
        </TouchableOpacity>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.pilotInputField}
            value={pilotInput}
            onChangeText={setPilotInput}
            placeholder="Escribe tu transmisión..."
            placeholderTextColor="#666"
            multiline
            editable={!isTransmitting && !isReceiving && !isRecording}
          />
        </View>

        <TouchableOpacity
          style={[styles.evaluateButton, (!pilotInput.trim() || isEvaluating) && styles.evaluateButtonDisabled]}
          onPress={() => evaluateTransmission(pilotInput)}
          disabled={!pilotInput.trim() || isEvaluating}
        >
          {isEvaluating ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="school" size={20} color={!pilotInput.trim() ? '#666' : '#fff'} />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.transmitButton, (isTransmitting || isReceiving || !pilotInput.trim()) && styles.transmitButtonDisabled]}
          onPress={sendPilotMessage}
          disabled={isTransmitting || isReceiving || !pilotInput.trim()}
        >
          <Ionicons 
            name="send" 
            size={22} 
            color={isTransmitting || isReceiving || !pilotInput.trim() ? '#666' : '#fff'} 
          />
          <Text style={[styles.transmitButtonText, (isTransmitting || isReceiving || !pilotInput.trim()) && { color: '#666' }]}>
            PTT
          </Text>
        </TouchableOpacity>
      </View>

      {/* Evaluation Modal */}
      {showEvaluation && evaluation && (
        <View style={styles.evaluationOverlay}>
          <View style={styles.evaluationCard}>
            <View style={styles.evaluationHeader}>
              <Text style={styles.evaluationTitle}>Evaluación</Text>
              <TouchableOpacity onPress={() => setShowEvaluation(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.scoreContainer}>
              <View style={[styles.scoreCircle, { borderColor: evaluation.total_score >= 80 ? '#4CAF50' : evaluation.total_score >= 60 ? '#FF9800' : '#F44336' }]}>
                <Text style={styles.scoreValue}>{evaluation.total_score || 0}</Text>
                <Text style={styles.scoreLabel}>/ 100</Text>
              </View>
            </View>

            <ScrollView style={styles.feedbackScroll}>
              <Text style={styles.feedbackLabel}>Retroalimentación:</Text>
              <Text style={styles.feedbackText}>{evaluation.feedback}</Text>

              {evaluation.correct_version && (
                <>
                  <Text style={styles.feedbackLabel}>Versión correcta:</Text>
                  <Text style={styles.correctVersionText}>{evaluation.correct_version}</Text>
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.closeEvaluationBtn} onPress={() => setShowEvaluation(false)}>
              <Text style={styles.closeEvaluationText}>Continuar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Quick Phrases */}
      <ScrollView horizontal style={styles.quickPhrases} showsHorizontalScrollIndicator={false}>
        {['Roger', 'Wilco', 'Say again', 'Stand by', 'Affirm', 'Negative', 'Request'].map((phrase) => (
          <TouchableOpacity
            key={phrase}
            style={styles.quickPhraseButton}
            onPress={() => setPilotInput(prev => prev ? `${prev} ${phrase}` : phrase)}
          >
            <Text style={styles.quickPhraseText}>{phrase}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );

  // ============== Main Render ==============

  if (mode === 'menu') {
    return renderMenu();
  }

  if (mode === 'listening') {
    return renderListeningTest();
  }

  if (mode === 'simulator') {
    if (inSimulation && selectedScenario) {
      return renderSimulation();
    }
    return renderSimulatorScenarios();
  }

  return renderMenu();
}

// ============== Styles ==============

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollView: {
    flex: 1,
  },
  menuContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    paddingTop: 16,
  },
  headerIcon: {
    width: 80,
    height: 80,
    backgroundColor: '#1E1E1E',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
  },
  modeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  modeIconContainer: {
    marginRight: 16,
  },
  modeIcon: {
    width: 70,
    height: 70,
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeInfo: {
    flex: 1,
  },
  modeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 6,
  },
  modeDescription: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  modeArrow: {
    marginLeft: 8,
  },
  tipsSection: {
    marginTop: 24,
  },
  tipsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  tipText: {
    flex: 1,
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
  },
  // Listening Test Styles
  listeningContainer: {
    flex: 1,
    backgroundColor: '#121212',
  },
  listeningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  listeningTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  replayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF980020',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  replayCount: {
    color: '#FF9800',
    fontSize: 14,
    fontWeight: '600',
  },
  listeningContent: {
    flex: 1,
    padding: 20,
  },
  segmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 12,
    borderRadius: 10,
    marginBottom: 20,
    gap: 8,
  },
  segmentTitle: {
    color: '#fff',
    fontSize: 14,
    flex: 1,
  },
  audioPlayerCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  audioInstructions: {
    color: '#888',
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2196F3',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 30,
    gap: 12,
  },
  playButtonActive: {
    backgroundColor: '#4CAF50',
  },
  playButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  replayInfo: {
    color: '#666',
    fontSize: 13,
    marginTop: 16,
  },
  levelSelectorContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  levelLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  levelSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  levelButton: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 12,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  levelButtonActive: {
    backgroundColor: '#2196F320',
    borderColor: '#2196F3',
  },
  levelButtonText: {
    color: '#888',
    fontSize: 18,
    fontWeight: 'bold',
  },
  levelButtonTextActive: {
    color: '#2196F3',
  },
  levelDescription: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  durationBadgeSmall: {
    backgroundColor: '#2196F320',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  durationTextSmall: {
    color: '#2196F3',
    fontSize: 12,
    fontWeight: '600',
  },
  responseSection: {
    marginBottom: 20,
  },
  responseLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  responseInput: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  responseModeSelector: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  modeButtonActive: {
    backgroundColor: '#2196F3',
  },
  modeButtonText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '600',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  voiceInputContainer: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    minHeight: 180,
    justifyContent: 'center',
  },
  voiceRecordButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  voiceRecordButtonActive: {
    backgroundColor: '#4CAF50',
  },
  pttButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  voiceInstructions: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
  },
  transcribingContainer: {
    alignItems: 'center',
    gap: 16,
  },
  transcribingText: {
    color: '#9C27B0',
    fontSize: 16,
    fontWeight: '500',
  },
  transcriptionPreview: {
    backgroundColor: '#0D0D0D',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    width: '100%',
  },
  transcriptionPreviewLabel: {
    color: '#4CAF50',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  transcriptionPreviewText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    gap: 10,
    marginBottom: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#333',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  nextButtonText: {
    color: '#2196F3',
    fontSize: 15,
    fontWeight: '500',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    color: '#888',
    fontSize: 16,
    marginTop: 16,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Result Modal
  resultOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  resultCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxHeight: '85%',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  resultTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  scoreContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  scoreCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0D0D0D',
  },
  scoreValue: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  scoreLabel: {
    color: '#888',
    fontSize: 14,
  },
  replayResultInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  replayResultText: {
    color: '#FF9800',
    fontSize: 14,
  },
  feedbackSection: {
    marginBottom: 16,
  },
  feedbackLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  feedbackText: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 22,
  },
  originalSection: {
    backgroundColor: '#0D0D0D',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  originalLabel: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  originalText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  continueButton: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Simulator Styles
  simulatorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  simulatorTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  aircraftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    marginBottom: 24,
  },
  aircraftIcon: {
    width: 70,
    height: 70,
    backgroundColor: '#2196F320',
    borderRadius: 35,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  aircraftInfo: {
    flex: 1,
  },
  aircraftName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  aircraftCallsign: {
    fontSize: 14,
    color: '#4CAF50',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginHorizontal: 16,
    marginBottom: 12,
  },
  scenariosContainer: {
    padding: 16,
    paddingTop: 0,
  },
  scenarioCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  scenarioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  phaseIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  phaseBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  phaseText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  scenarioName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  scenarioDescription: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  scenarioDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  scenarioDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  scenarioDetailText: {
    color: '#888',
    fontSize: 13,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Simulation Styles
  simulationContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  cockpitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  frequencyDisplay: {
    backgroundColor: '#001a00',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#004400',
  },
  frequencyLabel: {
    color: '#00ff00',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  frequencyValue: {
    color: '#00ff00',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  facilityInfo: {
    flex: 1,
    marginLeft: 16,
  },
  facilityName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  callsignText: {
    color: '#4CAF50',
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  endButton: {
    padding: 8,
    backgroundColor: '#F4433620',
    borderRadius: 8,
  },
  statusBar: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  radioLog: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  radioLogContent: {
    padding: 16,
  },
  messageContainer: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
  },
  pilotMessage: {
    borderLeftColor: '#4CAF50',
    marginLeft: 20,
  },
  atcMessage: {
    borderLeftColor: '#2196F3',
    marginRight: 20,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  messageSender: {
    fontSize: 11,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  messageTime: {
    fontSize: 10,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  messageText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  transmissionArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    backgroundColor: '#1A1A1A',
    borderTopWidth: 1,
    borderTopColor: '#333',
    gap: 12,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  pilotInputField: {
    color: '#fff',
    fontSize: 14,
    padding: 12,
    maxHeight: 80,
  },
  recordButton: {
    width: 44,
    height: 44,
    backgroundColor: '#2A2A2A',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F44336',
  },
  recordButtonActive: {
    backgroundColor: '#F44336',
  },
  evaluateButton: {
    width: 44,
    height: 44,
    backgroundColor: '#9C27B0',
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  evaluateButtonDisabled: {
    backgroundColor: '#333',
  },
  transmitButton: {
    width: 52,
    height: 52,
    backgroundColor: '#4CAF50',
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transmitButtonDisabled: {
    backgroundColor: '#333',
  },
  transmitButtonText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
    marginTop: 2,
  },
  quickPhrases: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  quickPhraseButton: {
    backgroundColor: '#333',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
  },
  quickPhraseText: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '500',
  },
  // Evaluation Modal
  evaluationOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  evaluationCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxHeight: '85%',
  },
  evaluationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  evaluationTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  feedbackScroll: {
    maxHeight: 200,
    marginBottom: 16,
  },
  correctVersionText: {
    color: '#4CAF50',
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
    backgroundColor: '#1A3D1F',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  closeEvaluationBtn: {
    backgroundColor: '#2196F3',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeEvaluationText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
