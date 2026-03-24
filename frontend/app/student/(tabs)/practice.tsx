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

export default function PracticeScreen() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [loading, setLoading] = useState(true);
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
  
  const { accessCode } = useAppStore();
  const soundRef = useRef<Audio.Sound | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    fetchScenarios();
    setupAudio();
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
      if (recordingRef.current) recordingRef.current.stopAndUnloadAsync();
    };
  }, []);

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

  // Request microphone permissions
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

  // Start recording voice
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

  // Stop recording and get transcript
  const stopRecording = async () => {
    if (!recordingRef.current) return '';
    
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      
      // For now, we return empty and user types - 
      // In a full implementation, you'd send the audio to a speech-to-text API
      // But since we have text input, user can type what they said
      return uri || '';
    } catch (e) {
      console.error('Stop recording error:', e);
      return '';
    }
  };

  // Evaluate the pilot's transmission
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

  const fetchScenarios = async () => {
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

  const startSimulation = async (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setInSimulation(true);
    setMessages([]);
    setIsReceiving(true);

    try {
      const initialContact = await apiService.getATCInitialContact(scenario.id);
      
      // Add initial ATC message
      const atcMessage: Message = {
        id: `msg_${Date.now()}`,
        type: 'atc',
        text: initialContact.message,
        timestamp: new Date(),
      };
      setMessages([atcMessage]);

      // Play audio if available
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

    // Start pulse animation
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

      // Scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);

      // Play audio
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  // Simulation View
  if (inSimulation && selectedScenario) {
    return (
      <SafeAreaView style={styles.simulationContainer} edges={['bottom']}>
        {/* Cockpit Header */}
        <View style={styles.cockpitHeader}>
          <View style={styles.frequencyDisplay}>
            <Text style={styles.frequencyLabel}>COM1</Text>
            <Text style={styles.frequencyValue}>{selectedScenario.frequency}</Text>
          </View>
          <View style={styles.facilityInfo}>
            <Text style={styles.facilityName}>{selectedScenario.atc_facility}</Text>
            <Text style={styles.aircraftCallsign}>N12345</Text>
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
                  {msg.type === 'pilot' ? 'PILOT (N12345)' : selectedScenario.atc_facility.toUpperCase()}
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
          {/* Record Button */}
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonActive
            ]}
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
              placeholder="Escribe tu transmisión de radio..."
              placeholderTextColor="#666"
              multiline
              editable={!isTransmitting && !isReceiving && !isRecording}
            />
          </View>

          {/* Evaluate Button */}
          <TouchableOpacity
            style={[
              styles.evaluateButton,
              (!pilotInput.trim() || isEvaluating) && styles.evaluateButtonDisabled
            ]}
            onPress={() => evaluateTransmission(pilotInput)}
            disabled={!pilotInput.trim() || isEvaluating}
          >
            {isEvaluating ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="school" size={20} color={!pilotInput.trim() ? '#666' : '#fff'} />
            )}
          </TouchableOpacity>

          {/* Transmit Button */}
          <TouchableOpacity
            style={[
              styles.transmitButton,
              (isTransmitting || isReceiving || !pilotInput.trim()) && styles.transmitButtonDisabled
            ]}
            onPress={sendPilotMessage}
            disabled={isTransmitting || isReceiving || !pilotInput.trim()}
          >
            <Ionicons 
              name="send" 
              size={22} 
              color={isTransmitting || isReceiving || !pilotInput.trim() ? '#666' : '#fff'} 
            />
            <Text style={[
              styles.transmitButtonText,
              (isTransmitting || isReceiving || !pilotInput.trim()) && { color: '#666' }
            ]}>
              PTT
            </Text>
          </TouchableOpacity>
        </View>

        {/* Evaluation Modal */}
        {showEvaluation && evaluation && (
          <View style={styles.evaluationOverlay}>
            <View style={styles.evaluationCard}>
              <View style={styles.evaluationHeader}>
                <Text style={styles.evaluationTitle}>Evaluación de Transmisión</Text>
                <TouchableOpacity onPress={() => setShowEvaluation(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              {/* Score */}
              <View style={styles.scoreContainer}>
                <View style={[
                  styles.scoreCircle, 
                  { borderColor: evaluation.total_score >= 80 ? '#4CAF50' : evaluation.total_score >= 60 ? '#FF9800' : '#F44336' }
                ]}>
                  <Text style={styles.scoreValue}>{evaluation.total_score || 0}</Text>
                  <Text style={styles.scoreLabel}>/ 100</Text>
                </View>
              </View>

              {/* Score Breakdown */}
              <View style={styles.scoreBreakdown}>
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreItemLabel}>Fraseología</Text>
                  <Text style={styles.scoreItemValue}>{evaluation.phraseology_score || 0}/25</Text>
                </View>
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreItemLabel}>Estructura</Text>
                  <Text style={styles.scoreItemValue}>{evaluation.structure_score || 0}/25</Text>
                </View>
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreItemLabel}>Claridad</Text>
                  <Text style={styles.scoreItemValue}>{evaluation.clarity_score || 0}/25</Text>
                </View>
                <View style={styles.scoreItem}>
                  <Text style={styles.scoreItemLabel}>Profesionalismo</Text>
                  <Text style={styles.scoreItemValue}>{evaluation.professionalism_score || 0}/25</Text>
                </View>
              </View>

              {/* Feedback */}
              <ScrollView style={styles.feedbackScroll}>
                <Text style={styles.feedbackTitle}>Retroalimentación:</Text>
                <Text style={styles.feedbackText}>{evaluation.feedback}</Text>

                {evaluation.correct_version && (
                  <>
                    <Text style={styles.feedbackTitle}>Versión correcta:</Text>
                    <Text style={styles.correctVersionText}>{evaluation.correct_version}</Text>
                  </>
                )}

                {evaluation.suggestions && evaluation.suggestions.length > 0 && (
                  <>
                    <Text style={styles.feedbackTitle}>Sugerencias:</Text>
                    {evaluation.suggestions.map((suggestion: string, idx: number) => (
                      <View key={idx} style={styles.suggestionItem}>
                        <Ionicons name="bulb" size={14} color="#FF9800" />
                        <Text style={styles.suggestionText}>{suggestion}</Text>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>

              <TouchableOpacity 
                style={styles.closeEvaluationBtn}
                onPress={() => setShowEvaluation(false)}
              >
                <Text style={styles.closeEvaluationText}>Continuar Practicando</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Quick Phrases */}
        <ScrollView 
          horizontal 
          style={styles.quickPhrases}
          showsHorizontalScrollIndicator={false}
        >
          {[
            'Roger',
            'Wilco',
            'Say again',
            'Stand by',
            'Affirm',
            'Negative',
            'Request',
          ].map((phrase) => (
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
  }

  // Scenario Selection View
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="radio" size={32} color="#2196F3" />
          </View>
          <Text style={styles.title}>Simulador ATC</Text>
          <Text style={styles.subtitle}>
            Practica comunicaciones de radio con un controlador ATC virtual impulsado por IA
          </Text>
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

        {/* Tips */}
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>Consejos de Radio</Text>
          <View style={styles.tipCard}>
            <Ionicons name="bulb" size={20} color="#FF9800" />
            <Text style={styles.tipText}>
              Habla claro y con confianza. Usa fraseología estándar.
            </Text>
          </View>
          <View style={styles.tipCard}>
            <Ionicons name="ear" size={20} color="#2196F3" />
            <Text style={styles.tipText}>
              Escucha atentamente la respuesta del ATC antes de transmitir.
            </Text>
          </View>
          <View style={styles.tipCard}>
            <Ionicons name="repeat" size={20} color="#4CAF50" />
            <Text style={styles.tipText}>
              Repite las instrucciones críticas (readback) para confirmar.
            </Text>
          </View>
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: 24,
    paddingTop: 16,
  },
  headerIcon: {
    width: 64,
    height: 64,
    backgroundColor: '#1E1E1E',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  aircraftCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    marginHorizontal: 16,
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
  tipsContainer: {
    padding: 16,
    marginTop: 8,
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
    borderRadius: 10,
    marginBottom: 8,
    gap: 12,
  },
  tipText: {
    flex: 1,
    color: '#ccc',
    fontSize: 14,
    lineHeight: 20,
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
  aircraftCallsignHeader: {
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
  // Recording and Evaluation styles
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
    maxHeight: '90%',
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
  scoreBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  scoreItem: {
    width: '48%',
    backgroundColor: '#2A2A2A',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreItemLabel: {
    color: '#888',
    fontSize: 12,
  },
  scoreItemValue: {
    color: '#4CAF50',
    fontSize: 14,
    fontWeight: '600',
  },
  feedbackScroll: {
    maxHeight: 200,
    marginBottom: 16,
  },
  feedbackTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  feedbackText: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 22,
  },
  correctVersionText: {
    color: '#4CAF50',
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
    backgroundColor: '#1A3D1F',
    padding: 12,
    borderRadius: 8,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  suggestionText: {
    flex: 1,
    color: '#ccc',
    fontSize: 13,
    lineHeight: 20,
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
