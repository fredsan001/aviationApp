import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const apiService = {
  // Admin Auth
  adminLogin: async (password: string) => {
    const response = await api.post('/admin/login', { password });
    return response.data;
  },

  // Categories
  getCategories: async () => {
    const response = await api.get('/categories');
    return response.data;
  },
  createCategory: async (data: { name: string; description?: string; order?: number }) => {
    const response = await api.post('/categories', data);
    return response.data;
  },
  updateCategory: async (id: string, data: { name?: string; description?: string }) => {
    const response = await api.put(`/categories/${id}`, data);
    return response.data;
  },
  updateCategoryOrder: async (categories: { id: string; order: number }[]) => {
    const response = await api.put('/categories/order', { categories });
    return response.data;
  },
  deleteCategory: async (id: string) => {
    const response = await api.delete(`/categories/${id}`);
    return response.data;
  },

  // Videos
  getVideos: async (category?: string) => {
    const params = category ? { category } : {};
    const response = await api.get('/videos', { params });
    return response.data;
  },
  getVideo: async (id: string) => {
    const response = await api.get(`/videos/${id}`);
    return response.data;
  },
  uploadVideo: async (formData: FormData, onProgress?: (progress: number) => void) => {
    const response = await api.post('/videos', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(progress);
        }
      },
    });
    return response.data;
  },
  updateVideo: async (id: string, data: { title?: string; description?: string; category?: string; categories?: string[]; subtitles?: any[] }) => {
    const response = await api.put(`/videos/${id}`, data);
    return response.data;
  },
  deleteVideo: async (id: string) => {
    const response = await api.delete(`/videos/${id}`);
    return response.data;
  },
  retranscribeVideo: async (id: string) => {
    const response = await api.post(`/videos/${id}/retranscribe`);
    return response.data;
  },
  getVideoStreamUrl: (id: string) => {
    return `${API_URL}/api/videos/${id}/stream`;
  },
  getVideoThumbnailUrl: (id: string) => {
    return `${API_URL}/api/videos/${id}/thumbnail`;
  },
  translateSubtitles: async (videoId: string, targetLanguage: string = 'es') => {
    const response = await api.post(`/videos/${videoId}/translate-subtitles`, { target_language: targetLanguage });
    return response.data;
  },

  // Subtitles
  addSubtitle: async (videoId: string, subtitle: { start_time: number; end_time: number; text: string }) => {
    const response = await api.post(`/videos/${videoId}/subtitles`, subtitle);
    return response.data;
  },
  updateSubtitle: async (videoId: string, subtitleId: string, subtitle: { start_time: number; end_time: number; text: string }) => {
    const response = await api.put(`/videos/${videoId}/subtitles/${subtitleId}`, subtitle);
    return response.data;
  },
  deleteSubtitle: async (videoId: string, subtitleId: string) => {
    const response = await api.delete(`/videos/${videoId}/subtitles/${subtitleId}`);
    return response.data;
  },

  // Access Codes
  getAccessCodes: async () => {
    const response = await api.get('/access-codes');
    return response.data;
  },
  createAccessCode: async (client_name: string, code?: string, expires_at?: string) => {
    const response = await api.post('/access-codes', { client_name, code, expires_at });
    return response.data;
  },
  verifyAccessCode: async (code: string) => {
    const response = await api.post('/access-codes/verify', { code });
    return response.data;
  },
  toggleAccessCode: async (id: string) => {
    const response = await api.put(`/access-codes/${id}/toggle`);
    return response.data;
  },
  deleteAccessCode: async (id: string) => {
    const response = await api.delete(`/access-codes/${id}`);
    return response.data;
  },

  // User Progress
  getProgress: async (accessCode: string) => {
    const response = await api.get(`/progress/${accessCode}`);
    return response.data;
  },
  updateProgress: async (
    accessCode: string,
    videoId: string,
    data: { watched_count?: number; last_position?: number; is_favorite?: boolean; completed?: boolean; ready_for_evaluation?: boolean }
  ) => {
    const response = await api.post(`/progress/${accessCode}/${videoId}`, data);
    return response.data;
  },
  getFavorites: async (accessCode: string) => {
    const response = await api.get(`/favorites/${accessCode}`);
    return response.data;
  },
  getWatchedVideos: async (accessCode: string) => {
    const response = await api.get(`/watched/${accessCode}`);
    return response.data;
  },

  // ATC Simulation
  getATCScenarios: async () => {
    const response = await api.get('/atc/scenarios');
    return response.data;
  },
  getATCInitialContact: async (scenarioId: string) => {
    const response = await api.get(`/atc/initial-contact/${scenarioId}`);
    return response.data;
  },
  simulateATC: async (scenarioId: string, pilotMessage: string, sessionId: string) => {
    const response = await api.post('/atc/simulate', {
      scenario_id: scenarioId,
      pilot_message: pilotMessage,
      session_id: sessionId,
    });
    return response.data;
  },
  resetATCSession: async (sessionId: string, scenarioId: string) => {
    const response = await api.post(`/atc/reset-session?session_id=${sessionId}&scenario_id=${scenarioId}`);
    return response.data;
  },
  evaluatePilotTransmission: async (pilotMessage: string, scenarioId: string, expectedContext?: string) => {
    const response = await api.post('/atc/evaluate', {
      pilot_message: pilotMessage,
      scenario_id: scenarioId,
      expected_context: expectedContext,
    });
    return response.data;
  },

  // Listening Test
  getRandomListeningSegment: async (accessCode: string, level: number = 1) => {
    const response = await api.get(`/listening-test/random-segment/${accessCode}?level=${level}`);
    return response.data;
  },
  evaluateListeningTest: async (accessCode: string, data: {
    video_id: string;
    subtitle_id: string;
    original_text: string;
    user_response: string;
    replay_count: number;
  }) => {
    const response = await api.post(`/listening-test/evaluate/${accessCode}`, data);
    return response.data;
  },
  getListeningTestHistory: async (accessCode: string) => {
    const response = await api.get(`/listening-test/history/${accessCode}`);
    return response.data;
  },
  
  // Audio Transcription
  transcribeAudio: async (audioUri: string) => {
    const formData = new FormData();
    
    // Determine the file extension from the URI
    const uriParts = audioUri.split('.');
    const extension = uriParts.length > 1 ? uriParts[uriParts.length - 1].toLowerCase() : 'm4a';
    
    // Map extension to MIME type
    const mimeTypes: Record<string, string> = {
      'm4a': 'audio/m4a',
      'mp3': 'audio/mpeg',
      'mp4': 'audio/mp4',
      'wav': 'audio/wav',
      'webm': 'audio/webm',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac',
      'caf': 'audio/x-caf',
    };
    
    const mimeType = mimeTypes[extension] || 'audio/m4a';
    const fileName = `recording.${extension}`;
    
    formData.append('audio', {
      uri: audioUri,
      type: mimeType,
      name: fileName,
    } as any);
    
    const response = await api.post('/transcribe-audio', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

export default api;
