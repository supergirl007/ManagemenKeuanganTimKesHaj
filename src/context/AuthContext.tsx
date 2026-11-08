import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthUser, UserRole } from '../types/index.ts';
import { api, getStoredToken, getStoredUser, clearStoredAuth, getStoredActiveYear, setStoredActiveYear } from '../utils/api.ts';

interface AuthContextType {
  user: AuthUser | null;
  role: UserRole | null;
  isAdmin: boolean;
  isAnggota: boolean;
  isLoading: boolean;
  activeYear: string;
  setActiveYear: (year: string) => void;
  login: (username: string, password: string, tahun?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser());
  const [activeYear, setActiveYearState] = useState<string>(getStoredActiveYear() || '2026');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const setActiveYear = (year: string) => {
    setActiveYearState(year);
    setStoredActiveYear(year);
  };

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      api
        .getMe()
        .then((userData) => {
          setUser(userData);
        })
        .catch(() => {
          clearStoredAuth();
          setUser(null);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string, password: string, tahun?: string) => {
    const res = await api.login(username, password, tahun);
    setUser(res.user);
    if (res.tahun_aktif) {
      setActiveYear(res.tahun_aktif);
    }
  };

  const logout = () => {
    clearStoredAuth();
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const u = await api.getMe();
      setUser(u);
    } catch {
      logout();
    }
  };

  const role = user?.role || null;
  const isAdmin = role === 'admin';
  const isAnggota = role === 'anggota';

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        isAdmin,
        isAnggota,
        isLoading,
        activeYear,
        setActiveYear,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
