import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { apiService } from '../../src/utils/api';

interface Student {
  code_id: string;
  access_code: string;
  client_name: string;
  watched_videos: number;
  ready_for_evaluation: number;
  total_views: number;
  last_activity: string | null;
  device_registered: boolean;
  created_at: string;
}

interface VideoProgress {
  video_id: string;
  video_title: string;
  video_duration: number;
  watched_count: number;
  completed: boolean;
  ready_for_evaluation: boolean;
  last_watched_at: string | null;
  last_position: number;
}

interface StudentDetail {
  videos: VideoProgress[];
  path_progress: {
    total_videos: number;
    completed_videos: number;
  };
}

export default function StudentProgress() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    try {
      const data = await apiService.getStudents();
      setStudents(data);
    } catch (error) {
      console.error('Error fetching students:', error);
    } finally {
      setLoading(false);
    }
  };

  const openStudentDetail = async (student: Student) => {
    setSelectedStudent(student);
    setLoadingDetail(true);
    try {
      const detail = await apiService.getStudentProgress(student.access_code);
      setStudentDetail(detail);
    } catch (error) {
      console.error('Error fetching student detail:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Nunca';
    const date = new Date(dateString);
    return date.toLocaleDateString('es', { 
      day: '2-digit', 
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderStudent = ({ item }: { item: Student }) => (
    <TouchableOpacity
      style={styles.studentCard}
      onPress={() => openStudentDetail(item)}
    >
      <View style={styles.studentHeader}>
        <View style={styles.studentIcon}>
          <Ionicons name="person" size={24} color="#fff" />
        </View>
        <View style={styles.studentInfo}>
          <Text style={styles.studentName}>{item.client_name}</Text>
          <Text style={styles.studentCode}>{item.access_code}</Text>
        </View>
        {item.device_registered && (
          <View style={styles.deviceBadge}>
            <Ionicons name="phone-portrait" size={14} color="#FF9800" />
          </View>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Ionicons name="eye" size={16} color="#4CAF50" />
          <Text style={styles.statValue}>{item.watched_videos}</Text>
          <Text style={styles.statLabel}>videos</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="repeat" size={16} color="#2196F3" />
          <Text style={styles.statValue}>{item.total_views}</Text>
          <Text style={styles.statLabel}>vistas</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="checkmark-circle" size={16} color="#E91E63" />
          <Text style={styles.statValue}>{item.ready_for_evaluation}</Text>
          <Text style={styles.statLabel}>listos</Text>
        </View>
      </View>

      <View style={styles.activityRow}>
        <Ionicons name="time-outline" size={14} color="#888" />
        <Text style={styles.activityText}>
          Última actividad: {formatDate(item.last_activity)}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderVideoProgress = ({ item }: { item: VideoProgress }) => (
    <View style={styles.videoProgressCard}>
      <View style={styles.videoProgressInfo}>
        <Text style={styles.videoProgressTitle} numberOfLines={1}>
          {item.video_title}
        </Text>
        <Text style={styles.videoProgressDuration}>
          {formatDuration(item.video_duration)}
        </Text>
      </View>
      <View style={styles.videoProgressStats}>
        <View style={styles.videoStatBadge}>
          <Ionicons name="eye" size={12} color="#4CAF50" />
          <Text style={styles.videoStatText}>{item.watched_count}x</Text>
        </View>
        {item.ready_for_evaluation && (
          <View style={[styles.videoStatBadge, styles.readyBadge]}>
            <Ionicons name="checkmark" size={12} color="#fff" />
          </View>
        )}
      </View>
      <Text style={styles.videoLastWatched}>
        {formatDate(item.last_watched_at)}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progreso de Estudiantes</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{students.length}</Text>
        </View>
      </View>

      {students.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={80} color="#444" />
          <Text style={styles.emptyTitle}>Sin estudiantes</Text>
          <Text style={styles.emptySubtitle}>
            Los estudiantes aparecerán aquí cuando empiecen a usar la app
          </Text>
        </View>
      ) : (
        <FlatList
          data={students}
          renderItem={renderStudent}
          keyExtractor={(item) => item.code_id}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Student Detail Modal */}
      <Modal
        visible={selectedStudent !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedStudent(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setSelectedStudent(null)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {selectedStudent?.client_name}
            </Text>
            <View style={{ width: 28 }} />
          </View>

          {loadingDetail ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2196F3" />
            </View>
          ) : studentDetail ? (
            <ScrollView style={styles.modalContent}>
              {/* Path Progress */}
              <View style={styles.pathProgressSection}>
                <Text style={styles.sectionTitle}>Progreso del Path</Text>
                <View style={styles.pathProgressCard}>
                  <View style={styles.pathProgressCircle}>
                    <Text style={styles.pathProgressNumber}>
                      {studentDetail.path_progress.completed_videos}
                    </Text>
                    <Text style={styles.pathProgressTotal}>
                      /{studentDetail.path_progress.total_videos}
                    </Text>
                  </View>
                  <View style={styles.pathProgressBar}>
                    <View
                      style={[
                        styles.pathProgressFill,
                        {
                          width: studentDetail.path_progress.total_videos > 0
                            ? `${(studentDetail.path_progress.completed_videos / studentDetail.path_progress.total_videos) * 100}%`
                            : '0%'
                        }
                      ]}
                    />
                  </View>
                  <Text style={styles.pathProgressLabel}>
                    {studentDetail.path_progress.total_videos > 0
                      ? `${Math.round((studentDetail.path_progress.completed_videos / studentDetail.path_progress.total_videos) * 100)}% completado`
                      : 'Sin path configurado'}
                  </Text>
                </View>
              </View>

              {/* Video History */}
              <View style={styles.historySection}>
                <Text style={styles.sectionTitle}>
                  Historial de Videos ({studentDetail.videos.length})
                </Text>
                {studentDetail.videos.map((video, index) => (
                  <View key={video.video_id} style={styles.videoProgressCard}>
                    <View style={styles.videoProgressInfo}>
                      <Text style={styles.videoProgressTitle} numberOfLines={1}>
                        {video.video_title}
                      </Text>
                      <Text style={styles.videoProgressDuration}>
                        {formatDuration(video.video_duration)}
                      </Text>
                    </View>
                    <View style={styles.videoProgressStats}>
                      <View style={styles.videoStatBadge}>
                        <Ionicons name="eye" size={12} color="#4CAF50" />
                        <Text style={styles.videoStatText}>{video.watched_count}x</Text>
                      </View>
                      {video.ready_for_evaluation && (
                        <View style={[styles.videoStatBadge, styles.readyBadge]}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      )}
                    </View>
                    <Text style={styles.videoLastWatched}>
                      {formatDate(video.last_watched_at)}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  countBadge: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  listContent: {
    padding: 16,
  },
  studentCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  studentName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  studentCode: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  deviceBadge: {
    backgroundColor: '#FF980020',
    padding: 6,
    borderRadius: 6,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    color: '#888',
    fontSize: 12,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activityText: {
    color: '#888',
    fontSize: 12,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#121212',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  pathProgressSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  pathProgressCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  pathProgressCircle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  pathProgressNumber: {
    color: '#E91E63',
    fontSize: 36,
    fontWeight: '700',
  },
  pathProgressTotal: {
    color: '#888',
    fontSize: 18,
  },
  pathProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  pathProgressFill: {
    height: '100%',
    backgroundColor: '#E91E63',
  },
  pathProgressLabel: {
    color: '#888',
    fontSize: 12,
  },
  historySection: {
    marginBottom: 24,
  },
  videoProgressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  videoProgressInfo: {
    flex: 1,
  },
  videoProgressTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  videoProgressDuration: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  videoProgressStats: {
    flexDirection: 'row',
    gap: 6,
    marginRight: 12,
  },
  videoStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  videoStatText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  readyBadge: {
    backgroundColor: '#E91E63',
  },
  videoLastWatched: {
    color: '#666',
    fontSize: 10,
    width: 60,
    textAlign: 'right',
  },
});
