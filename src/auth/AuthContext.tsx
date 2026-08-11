import * as SecureStore from 'expo-secure-store';
import { useSQLiteContext } from 'expo-sqlite';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getCaisseForUser } from '../db/repositories/caisses';
import { authenticate, changerIdentifiantEtCode, getUserById } from '../db/repositories/users';
import type { User } from '../domain/types';
import { syncSignIn, syncSignOut } from '../sync/auth';
import { pushCaisse } from '../sync/push';

const SESSION_KEY = 'akajo_session_user_id';

interface AuthContextValue {
  currentUser: User | null;
  pendingOnboarding: User | null;
  isManager: boolean;
  isDirigeant: boolean;
  isElevated: boolean;
  isLoading: boolean;
  login: (identifiant: string, code: string) => Promise<{ ok: boolean; error?: string; syncError?: string; mustOnboard?: boolean }>;
  completeOnboarding: (identifiant: string, code: string) => Promise<{ ok: boolean; error?: string; syncError?: string }>;
  cancelOnboarding: () => void;
  logout: () => Promise<void>;
  refreshCurrentUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [pendingOnboarding, setPendingOnboarding] = useState<User | null>(null);
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

  const establishSession = useCallback(async (user: User, identifiant: string, code: string) => {
    setCurrentUser(user);
    await SecureStore.setItemAsync(SESSION_KEY, user.id);
    // Établit/crée la session cloud correspondante pour la synchro. N'affecte jamais
    // le résultat de la connexion locale (fonctionne hors-ligne) — mais le message
    // d'erreur éventuel est remonté pour pouvoir diagnostiquer un échec de synchro.
    const syncResult = await syncSignIn({ identifiant, code, nom: user.nom, role: user.role }).catch((err) => ({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }));
    return syncResult.ok ? undefined : syncResult.error;
  }, []);

  const login = useCallback(
    async (identifiant: string, code: string) => {
      if (!identifiant.trim() || !code.trim()) {
        return { ok: false, error: "Identifiant et code d'accès requis." };
      }
      const user = await authenticate(db, identifiant, code);
      if (!user) {
        return { ok: false, error: "Identifiant ou code d'accès incorrect." };
      }
      // Identifiant/code provisoires (créés ou réinitialisés par le Gérant) : l'accès
      // définitif n'est établi qu'une fois que l'utilisateur a choisi les siens.
      if (user.doitChangerCode) {
        setPendingOnboarding(user);
        return { ok: true, mustOnboard: true };
      }
      const syncError = await establishSession(user, identifiant, code);
      return { ok: true, syncError };
    },
    [db, establishSession]
  );

  const completeOnboarding = useCallback(
    async (identifiant: string, code: string) => {
      if (!pendingOnboarding) return { ok: false, error: 'Aucune session en attente.' };
      const result = await changerIdentifiantEtCode(db, pendingOnboarding.id, { identifiant, code });
      if ('error' in result) return { ok: false, error: result.error };
      setPendingOnboarding(null);
      const caisse = await getCaisseForUser(db, result.id);
      if (caisse) pushCaisse(caisse).catch(() => {});
      const syncError = await establishSession(result, identifiant, code);
      return { ok: true, syncError };
    },
    [db, pendingOnboarding, establishSession]
  );

  const cancelOnboarding = useCallback(() => {
    setPendingOnboarding(null);
  }, []);

  const logout = useCallback(async () => {
    setCurrentUser(null);
    await SecureStore.deleteItemAsync(SESSION_KEY);
    syncSignOut().catch(() => {});
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
      pendingOnboarding,
      isManager: currentUser?.role === 'gerant',
      isDirigeant: currentUser?.role === 'dirigeant',
      isElevated: currentUser?.role === 'gerant' || currentUser?.role === 'dirigeant',
      isLoading,
      login,
      completeOnboarding,
      cancelOnboarding,
      logout,
      refreshCurrentUser,
    }),
    [currentUser, pendingOnboarding, isLoading, login, completeOnboarding, cancelOnboarding, logout, refreshCurrentUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un <AuthProvider>');
  return ctx;
}
