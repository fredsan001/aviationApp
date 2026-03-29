export interface Subtitle {
  id: string;
  start_time: number;
  end_time: number;
  text: string;
}

export interface Video {
  id: string;
  title: string;
  description: string;
  category: string;  // For backwards compatibility
  categories: string[];  // Multiple categories
  video_filename: string;
  duration: number;
  subtitles: Subtitle[];
  created_at: string;
  is_processing: boolean;
  processing_status: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  order: number;
  created_at: string;
}

export interface AccessCode {
  id: string;
  code: string;
  client_name: string;
  is_active: boolean;
  created_at: string;
  expires_at?: string;
}

export interface UserProgress {
  id: string;
  access_code: string;
  video_id: string;
  watched_count: number;
  last_position: number;
  is_favorite: boolean;
  completed: boolean;
  updated_at: string;
}
