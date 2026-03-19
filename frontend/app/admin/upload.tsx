import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { apiService } from '../../src/utils/api';

export default function UploadVideo() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('General');
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [selectedFile, setSelectedFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const pickVideo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'video/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        setSelectedFile(result.assets[0]);
      }
    } catch (error) {
      console.error('Error picking video:', error);
      Alert.alert('Error', 'Failed to select video');
    }
  };

  const handleUpload = async () => {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a video title');
      return;
    }
    if (!selectedFile) {
      Alert.alert('Error', 'Please select a video file');
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('description', description.trim());
      formData.append('category', category);
      formData.append('auto_transcribe', autoTranscribe ? 'true' : 'false');
      
      // Handle file differently for web vs native
      if (Platform.OS === 'web') {
        // For web, fetch the file and create a proper blob
        const response = await fetch(selectedFile.uri);
        const blob = await response.blob();
        formData.append('file', blob, selectedFile.name || 'video.mp4');
      } else {
        // For native (iOS/Android)
        formData.append('file', {
          uri: selectedFile.uri,
          name: selectedFile.name || 'video.mp4',
          type: selectedFile.mimeType || 'video/mp4',
        } as any);
      }

      console.log('Uploading video...', { title, category, autoTranscribe });
      
      await apiService.uploadVideo(formData, (progress) => {
        setUploadProgress(progress);
        console.log('Upload progress:', progress);
      });

      Alert.alert(
        '✅ Video Uploaded!', 
        'Video uploaded successfully!' + (autoTranscribe ? '\n\nThe AI is now transcribing the audio to generate subtitles. This may take a few minutes.' : ''), 
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      console.error('Upload error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to upload video. Please try again.';
      Alert.alert('❌ Upload Failed', errorMessage);
    } finally {
      setUploading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Video Selection */}
          <TouchableOpacity
            style={styles.fileSelector}
            onPress={pickVideo}
            disabled={uploading}
          >
            <View style={styles.fileSelectorContent}>
              <Ionicons 
                name={selectedFile ? 'checkmark-circle' : 'cloud-upload'} 
                size={48} 
                color={selectedFile ? '#4CAF50' : '#2196F3'} 
              />
              <Text style={styles.fileSelectorText}>
                {selectedFile ? selectedFile.name : 'Tap to select a video'}
              </Text>
              {selectedFile && (
                <Text style={styles.fileSizeText}>
                  {((selectedFile.size || 0) / (1024 * 1024)).toFixed(2)} MB
                </Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Title Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter video title"
              placeholderTextColor="#666"
              value={title}
              onChangeText={setTitle}
              editable={!uploading}
            />
          </View>

          {/* Description Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Enter video description"
              placeholderTextColor="#666"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              editable={!uploading}
            />
          </View>

          {/* Category Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Category</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter category (e.g., Takeoff, Landing)"
              placeholderTextColor="#666"
              value={category}
              onChangeText={setCategory}
              editable={!uploading}
            />
          </View>

          {/* Auto Transcribe Toggle */}
          <View style={styles.toggleGroup}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Auto-generate Subtitles</Text>
              <Text style={styles.toggleDescription}>Use AI to automatically transcribe audio</Text>
            </View>
            <Switch
              value={autoTranscribe}
              onValueChange={setAutoTranscribe}
              trackColor={{ false: '#333', true: '#4CAF50' }}
              thumbColor={autoTranscribe ? '#fff' : '#888'}
              disabled={uploading}
            />
          </View>

          {/* Upload Progress */}
          {uploading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>{uploadProgress}% uploaded</Text>
            </View>
          )}

          {/* Upload Button */}
          <TouchableOpacity
            style={[styles.uploadButton, (!selectedFile || uploading) && styles.uploadButtonDisabled]}
            onPress={handleUpload}
            disabled={!selectedFile || uploading}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={24} color="#fff" />
                <Text style={styles.uploadButtonText}>Upload Video</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  fileSelector: {
    backgroundColor: '#1E1E1E',
    borderRadius: 16,
    padding: 32,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#333',
    borderStyle: 'dashed',
  },
  fileSelectorContent: {
    alignItems: 'center',
  },
  fileSelectorText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  fileSizeText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  toggleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toggleDescription: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  progressText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  uploadButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  uploadButtonDisabled: {
    backgroundColor: '#333',
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
