import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AppState {
  isAdmin: boolean;
  accessCode: string | null;
  clientName: string | null;
  setAdmin: (isAdmin: boolean) => void;
  setAccessCode: (code: string | null, clientName?: string) => void;
  loadStoredData: () => Promise<void>;
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  isAdmin: false,
  accessCode: null,
  clientName: null,
  
  setAdmin: (isAdmin: boolean) => {
    set({ isAdmin });
    AsyncStorage.setItem('isAdmin', isAdmin ? 'true' : 'false');
  },
  
  setAccessCode: (code: string | null, clientName?: string) => {
    set({ accessCode: code, clientName: clientName || null });
    if (code) {
      AsyncStorage.setItem('accessCode', code);
      if (clientName) {
        AsyncStorage.setItem('clientName', clientName);
      }
    } else {
      AsyncStorage.removeItem('accessCode');
      AsyncStorage.removeItem('clientName');
    }
  },
  
  loadStoredData: async () => {
    try {
      const [isAdmin, accessCode, clientName] = await Promise.all([
        AsyncStorage.getItem('isAdmin'),
        AsyncStorage.getItem('accessCode'),
        AsyncStorage.getItem('clientName'),
      ]);
      set({
        isAdmin: isAdmin === 'true',
        accessCode,
        clientName,
      });
    } catch (error) {
      console.error('Error loading stored data:', error);
    }
  },
  
  logout: () => {
    set({ isAdmin: false, accessCode: null, clientName: null });
    AsyncStorage.multiRemove(['isAdmin', 'accessCode', 'clientName']);
  },
}));
