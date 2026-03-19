import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video } from '../types';

interface VideoCardProps {
  video: Video;
  onPress: () => void;
  showAdminControls?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({
  video,
  onPress,
  showAdminControls,
  onEdit,
  onDelete,
}) => {
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.thumbnailContainer}>
        <View style={styles.thumbnail}>
          <Ionicons name="play-circle" size={48} color="#fff" />
        </View>
        <View style={styles.durationBadge}>
          <Text style={styles.durationText}>{formatDuration(video.duration)}</Text>
        </View>
        {video.is_processing && (
          <View style={styles.processingOverlay}>
            <ActivityIndicator color="#fff" size="small" />
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        )}
      </View>
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{video.title}</Text>
        <Text style={styles.category}>{video.category}</Text>
        {video.subtitles.length > 0 && (
          <View style={styles.subtitleBadge}>
            <Ionicons name="text" size={12} color="#4CAF50" />
            <Text style={styles.subtitleText}>{video.subtitles.length} subtitles</Text>
          </View>
        )}
        {showAdminControls && (
          <View style={styles.adminControls}>
            <TouchableOpacity style={styles.adminButton} onPress={onEdit}>
              <Ionicons name="pencil" size={18} color="#2196F3" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.adminButton} onPress={onDelete}>
              <Ionicons name="trash" size={18} color="#F44336" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  thumbnailContainer: {
    position: 'relative',
    height: 180,
  },
  thumbnail: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
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
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: '#fff',
    fontSize: 12,
    marginTop: 8,
  },
  content: {
    padding: 12,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  category: {
    color: '#888',
    fontSize: 14,
  },
  subtitleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  subtitleText: {
    color: '#4CAF50',
    fontSize: 12,
    marginLeft: 4,
  },
  adminControls: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 12,
    gap: 12,
  },
  adminButton: {
    padding: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
  },
});
