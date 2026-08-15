import type { SQLiteDatabase } from 'expo-sqlite';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { deleteDatabaseAsync, SQLiteProvider } from 'expo-sqlite';
import React, { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { DataProvider } from '../src/data/DataContext';
import { DATABASE_NAME, migrate } from '../src/db/schema';
import { colors } from '../src/theme/colors';
import { useAppFonts } from '../src/theme/useAppFonts';
import { DatabaseErrorScreen } from '../src/screens/DatabaseErrorScreen';
import { LoadingScreen } from '../src/screens/LoadingScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { fontsLoaded, fontsError } = useAppFonts();
  const [dbError, setDbError] = useState<Error | null>(null);
  const [resetting, setResetting] = useState(false);
  // Change de clé pour forcer un nouveau montage de <SQLiteProvider> après une
  // réinitialisation, sans quoi il resterait bloqué sur son état d'erreur figé.
  const [providerKey, setProviderKey] = useState(0);

  const initDatabase = useCallback(async (db: SQLiteDatabase) => {
    await migrate(db);
    await SplashScreen.hideAsync();
  }, []);

  useEffect(() => {
    // Si l'ouverture/migration échoue, initDatabase n'appelle jamais hideAsync : sans
    // ça l'utilisateur resterait bloqué sur l'écran de démarrage au lieu de voir
    // l'écran de récupération.
    if (dbError) SplashScreen.hideAsync().catch(() => {});
  }, [dbError]);

  const handleReset = useCallback(async () => {
    setResetting(true);
    await deleteDatabaseAsync(DATABASE_NAME).catch(() => {});
    setDbError(null);
    setResetting(false);
    setProviderKey((k) => k + 1);
  }, []);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  if (dbError) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <DatabaseErrorScreen error={dbError} resetting={resetting} onReset={handleReset} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SQLiteProvider key={providerKey} databaseName={DATABASE_NAME} onInit={initDatabase} onError={setDbError}>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function AuthGate() {
  const { isLoading, currentUser } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  const isElevated = currentUser?.role === 'gerant' || currentUser?.role === 'dirigeant';

  return (
    <DataProvider>
      <RootNavigator isAuthenticated={!!currentUser} isElevated={isElevated} />
    </DataProvider>
  );
}

function RootNavigator({ isAuthenticated, isElevated }: { isAuthenticated: boolean; isElevated: boolean }) {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="partenaire/[id]"
          options={{ headerShown: true, title: 'Partenaire', presentation: 'modal' }}
        />
        <Stack.Protected guard={isElevated}>
          <Stack.Screen
            name="comptes"
            options={{ headerShown: true, title: 'Comptes utilisateurs', presentation: 'modal' }}
          />
        </Stack.Protected>
      </Stack.Protected>
    </Stack>
  );
}
