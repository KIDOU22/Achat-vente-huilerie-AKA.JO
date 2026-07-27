import * as SecureStore from 'expo-secure-store';
import { useSQLiteContext } from 'expo-sqlite';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authenticate, getUserById } from '../db/repositories/users';
import type { User } from '../domain/types';

const SESSION_KEY = 'akajo_session_user_id';

interface AuthContextValue {
  currentUser: User | null;
  isManager: boolean;
  isLoading: boolean;
  login: (identifiant: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const savedId = await SecureStore.getItemAsync(SESSION_KEY);
        if (savedId) {
          const user = await getUserById(db, savedId);
          if (!cancelled && user && user.actif) {
            setCurrentUser(user);
          } else if (!cancelled) {
            await SecureStore.deleteItemAsync(SESSION_KEY);
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db]);

  const login = useCallback(
    async (identifiant: string, code: string) => {
      if (!identifiant.trim() || !code.trim()) {
        return { ok: false, error: "Identifiant et code d'accès requis." };
      }
      const user = await authenticate(db, identifiant, code);
      if (!user) {
        return { ok: false, error: "Identifiant ou code d'accès incorrect." };
      }
      setCurrentUser(user);
      await SecureStore.setItemAsync(SESSION_KEY, user.id);
      return { ok: true };
    },
    [db]
  );

  const logout = useCallback(async () => {
    setCurrentUser(null);
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    if (!currentUser) return;
    const user = await getUserById(db, currentUser.id);
    if (user && user.actif) {
      setCurrentUser(user);
    } else {
      await logout();
    }
  }, [currentUser, db, logout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      isManager: currentUser?.role === 'gerant',
      isLoading,
      login,
      logout,
      refreshCurrentUser,
    }),
    [currentUser, isLoading, login, logout, refreshCurrentUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un <AuthProvider>');
  return ctx;
}
