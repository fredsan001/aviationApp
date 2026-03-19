import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Subtitle } from '../types';

interface SubtitleDisplayProps {
  subtitle: Subtitle | null;
  isLoopActive?: boolean;
}

export const SubtitleDisplay: React.FC<SubtitleDisplayProps> = ({ subtitle, isLoopActive }) => {
  if (!subtitle) return null;

  return (
    <View style={[styles.container, isLoopActive && styles.loopActive]}>
      <Text style={styles.text}>{subtitle.text}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  loopActive: {
    borderColor: '#FF9800',
    borderWidth: 2,
  },
  text: {
    color: '#fff',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 26,
    fontWeight: '500',
  },
});
