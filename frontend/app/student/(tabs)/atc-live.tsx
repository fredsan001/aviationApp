import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
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

  const filteredFeeds = selectedType 
    ? LIVE_FEEDS.filter(feed => feed.type === selectedType)
    : LIVE_FEEDS;

  const handleOpenFeed = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
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
              onPress={() => handleOpenFeed(feed.url)}
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
});
