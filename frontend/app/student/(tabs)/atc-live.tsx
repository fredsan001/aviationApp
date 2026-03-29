import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface LiveFeed {
  id: string;
  name: string;
  location: string;
  frequency: string;
  url: string;
  type: 'tower' | 'approach' | 'center' | 'ground';
}

const LIVE_FEEDS: LiveFeed[] = [
  {
    id: '1',
    name: 'Los Angeles Tower',
    location: 'LAX, California',
    frequency: '133.900 MHz',
    url: 'https://www.liveatc.net/hlisten.php?mount=klax_twr&icao=klax',
    type: 'tower',
  },
  {
    id: '2',
    name: 'New York Approach',
    location: 'JFK, New York',
    frequency: '127.400 MHz',
    url: 'https://www.liveatc.net/hlisten.php?mount=kjfk_app&icao=kjfk',
    type: 'approach',
  },
  {
    id: '3',
    name: 'Chicago Center',
    location: 'Chicago, Illinois',
    frequency: '128.150 MHz',
    url: 'https://www.liveatc.net/hlisten.php?mount=kord_app_nw&icao=kord',
    type: 'center',
  },
  {
    id: '4',
    name: 'Miami Ground',
    location: 'MIA, Florida',
    frequency: '121.800 MHz',
    url: 'https://www.liveatc.net/hlisten.php?mount=kmia6&icao=kmia',
    type: 'ground',
  },
  {
    id: '5',
    name: 'London Heathrow',
    location: 'LHR, Reino Unido',
    frequency: '118.500 MHz',
    url: 'https://www.liveatc.net/hlisten.php?mount=egll_twr&icao=egll',
    type: 'tower',
  },
  {
    id: '6',
    name: 'Dubai Tower',
    location: 'DXB, UAE',
    frequency: '118.750 MHz',
    url: 'https://www.liveatc.net/hlisten.php?mount=omdb3&icao=omdb',
    type: 'tower',
  },
];

const getTypeColor = (type: LiveFeed['type']) => {
  switch (type) {
    case 'tower': return '#4CAF50';
    case 'approach': return '#2196F3';
    case 'center': return '#9C27B0';
    case 'ground': return '#FF9800';
    default: return '#888';
  }
};

const getTypeLabel = (type: LiveFeed['type']) => {
  switch (type) {
    case 'tower': return 'Torre';
    case 'approach': return 'Aproximación';
    case 'center': return 'Centro';
    case 'ground': return 'Tierra';
    default: return type;
  }
};

export default function ATCLiveScreen() {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedFeed, setSelectedFeed] = useState<LiveFeed | null>(null);

  const filteredFeeds = selectedType 
    ? LIVE_FEEDS.filter(feed => feed.type === selectedType)
    : LIVE_FEEDS;

  const handleOpenFeed = (feed: LiveFeed) => {
    setSelectedFeed(feed);
  };

  const handleCloseFeed = () => {
    setSelectedFeed(null);
  };

  const handleOpenInBrowser = async () => {
    if (!selectedFeed) return;
    
    try {
      const supported = await Linking.canOpenURL(selectedFeed.url);
      if (supported) {
        await Linking.openURL(selectedFeed.url);
      } else {
        Alert.alert('Error', 'No se puede abrir el enlace');
      }
    } catch (error) {
      console.error('Error opening URL:', error);
      Alert.alert('Error', 'No se pudo abrir la transmisión');
    }
    handleCloseFeed();
  };

  const types = ['tower', 'approach', 'center', 'ground'] as const;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="radio" size={32} color="#2196F3" />
          </View>
          <Text style={styles.title}>ATC Live</Text>
          <Text style={styles.subtitle}>
            Escucha comunicaciones ATC en tiempo real de aeropuertos alrededor del mundo
          </Text>
        </View>

        {/* Filter Chips */}
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <TouchableOpacity
              style={[
                styles.filterChip,
                !selectedType && styles.filterChipActive,
              ]}
              onPress={() => setSelectedType(null)}
            >
              <Text style={[
                styles.filterChipText,
                !selectedType && styles.filterChipTextActive,
              ]}>Todos</Text>
            </TouchableOpacity>
            {types.map((type) => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterChip,
                  selectedType === type && { backgroundColor: getTypeColor(type) },
                ]}
                onPress={() => setSelectedType(selectedType === type ? null : type)}
              >
                <Text style={[
                  styles.filterChipText,
                  selectedType === type && styles.filterChipTextActive,
                ]}>{getTypeLabel(type)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Live Feeds */}
        <View style={styles.feedsContainer}>
          {filteredFeeds.map((feed) => (
            <TouchableOpacity
              key={feed.id}
              style={styles.feedCard}
              onPress={() => handleOpenFeed(feed)}
              activeOpacity={0.8}
            >
              <View style={styles.feedHeader}>
                <View style={[styles.liveIndicator, { backgroundColor: getTypeColor(feed.type) }]}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>EN VIVO</Text>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: getTypeColor(feed.type) + '30' }]}>
                  <Text style={[styles.typeText, { color: getTypeColor(feed.type) }]}>
                    {getTypeLabel(feed.type)}
                  </Text>
                </View>
              </View>
              
              <Text style={styles.feedName}>{feed.name}</Text>
              
              <View style={styles.feedDetails}>
                <View style={styles.feedDetail}>
                  <Ionicons name="location" size={14} color="#888" />
                  <Text style={styles.feedDetailText}>{feed.location}</Text>
                </View>
                <View style={styles.feedDetail}>
                  <Ionicons name="radio-outline" size={14} color="#888" />
                  <Text style={styles.feedDetailText}>{feed.frequency}</Text>
                </View>
              </View>

              <View style={styles.listenButton}>
                <Ionicons name="headset" size={18} color="#fff" />
                <Text style={styles.listenButtonText}>Escuchar</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={24} color="#2196F3" />
          <Text style={styles.infoText}>
            Las transmisiones ATC en vivo son proporcionadas por LiveATC.net. 
            Escuchar comunicaciones reales te ayudará a familiarizarte con la fraseología estándar.
          </Text>
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      <Modal
        visible={selectedFeed !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCloseFeed}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.confirmModalContent}>
            {/* Header with close button */}
            <TouchableOpacity 
              style={styles.modalCloseButton} 
              onPress={handleCloseFeed}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <Ionicons name="close-circle" size={32} color="#666" />
            </TouchableOpacity>

            {/* Feed Info */}
            <View style={styles.feedInfoContainer}>
              <View style={[styles.feedTypeIconLarge, { backgroundColor: selectedFeed ? getTypeColor(selectedFeed.type) + '30' : '#333' }]}>
                <Ionicons 
                  name={
                    selectedFeed?.type === 'tower' ? 'business' :
                    selectedFeed?.type === 'approach' ? 'airplane' :
                    selectedFeed?.type === 'center' ? 'navigate' : 'disc'
                  } 
                  size={40} 
                  color={selectedFeed ? getTypeColor(selectedFeed.type) : '#888'} 
                />
              </View>
              
              <Text style={styles.feedNameLarge}>{selectedFeed?.name}</Text>
              <Text style={styles.feedLocationLarge}>{selectedFeed?.location}</Text>
              
              <View style={styles.frequencyBadgeLarge}>
                <Ionicons name="radio" size={16} color="#4CAF50" />
                <Text style={styles.frequencyTextLarge}>{selectedFeed?.frequency}</Text>
              </View>
            </View>

            {/* Live Badge */}
            <View style={[styles.liveBadgeLarge, { backgroundColor: selectedFeed ? getTypeColor(selectedFeed.type) : '#888' }]}>
              <View style={styles.liveDotLarge} />
              <Text style={styles.liveTextLarge}>TRANSMISIÓN EN VIVO</Text>
            </View>

            {/* Info Text */}
            <Text style={styles.modalInfoText}>
              Se abrirá en tu navegador para una mejor experiencia de audio.
            </Text>

            {/* Action Buttons */}
            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={handleCloseFeed}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.openButton, { backgroundColor: selectedFeed ? getTypeColor(selectedFeed.type) : '#2196F3' }]}
                onPress={handleOpenInBrowser}
              >
                <Ionicons name="open-outline" size={20} color="#fff" />
                <Text style={styles.openButtonText}>Abrir y Escuchar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  filterContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: '#2196F3',
  },
  filterChipText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
  },
  feedsContainer: {
    padding: 16,
    paddingTop: 0,
  },
  feedCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  feedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  feedName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  feedDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  feedDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  feedDetailText: {
    color: '#888',
    fontSize: 13,
  },
  listenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  listenButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#1E1E1E',
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoText: {
    flex: 1,
    color: '#888',
    fontSize: 13,
    lineHeight: 20,
  },
  // Confirmation Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  confirmModalContent: {
    backgroundColor: '#1E1E1E',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    position: 'relative',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  feedInfoContainer: {
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  feedTypeIconLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  feedNameLarge: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  feedLocationLarge: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  frequencyBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF5020',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  frequencyTextLarge: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '600',
  },
  liveBadgeLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
    marginBottom: 16,
  },
  liveDotLarge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
  },
  liveTextLarge: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  modalInfoText: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#333',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  openButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  openButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
