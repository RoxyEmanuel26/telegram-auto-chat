import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar?: string | null;
  twoFactorEnabled: boolean;
  createdAt?: string | null;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  twoFactorRequired: boolean;
  tempToken: string | null;
  
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  set2FARequired: (tempToken: string) => void;
  clearAuth: () => void;
  loadAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  twoFactorRequired: false,
  tempToken: null,

  setAuth: (user, accessToken, refreshToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
    }
    set({
      user,
      accessToken,
      refreshToken,
      twoFactorRequired: false,
      tempToken: null,
    });
  },

  set2FARequired: (tempToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('temp_token', tempToken);
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      twoFactorRequired: true,
      tempToken,
    });
  },

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('temp_token');
    }
    set({
      user: null,
      accessToken: null,
      refreshToken: null,
      twoFactorRequired: false,
      tempToken: null,
    });
  },

  loadAuth: () => {
    if (typeof window !== 'undefined') {
      const userStr = localStorage.getItem('user');
      const accessToken = localStorage.getItem('access_token');
      const refreshToken = localStorage.getItem('refresh_token');
      const tempToken = localStorage.getItem('temp_token');

      if (userStr && accessToken && refreshToken) {
        try {
          const user = JSON.parse(userStr);
          set({
            user,
            accessToken,
            refreshToken,
            twoFactorRequired: false,
            tempToken: null,
          });
        } catch {
          set({ user: null, accessToken: null, refreshToken: null });
        }
      } else if (tempToken) {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          twoFactorRequired: true,
          tempToken,
        });
      }
    }
  },
}));
