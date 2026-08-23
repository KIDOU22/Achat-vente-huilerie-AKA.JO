import type { SQLiteDatabase } from 'expo-sqlite';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
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
  // Après un échec d'ouverture/migration, expo-sqlite garde le fichier verrouillé par
  // une connexion native ouverte mais jamais refermée (elle n'est fermée que si
  // onInit réussit — voir son code source) : rien côté JS ne permet plus de la
  // libérer. Essayer de SUPPRIMER ce même fichier (deleteDatabaseAsync) pouvait donc
  // rester bloqué indéfiniment en attendant un verrou qui ne se libère jamais — le
  // bouton "Réinitialiser" restait figé sans aucun message. Solution : ne plus
  // toucher au fichier bloqué, ouvrir un nouveau fichier vide sous un autre nom.
  // L'ancien reste orphelin sur le disque (quelques Ko, sans conséquence).
  const [resetCount, setResetCount] = useState(0);
  const databaseName = resetCount === 0 ? DATABASE_NAME : `${DATABASE_NAME}.reset${resetCount}`;

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

  const handleReset = useCallback(() => {
    setDbError(null);
    setResetCount((k) => k + 1);
  }, []);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  if (dbError) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <DatabaseErrorScreen error={dbError} onReset={handleReset} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SQLiteProvider key={databaseName} databaseName={databaseName} onInit={initDatabase} onError={setDbError}>
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
          <Stack.Screen name="hub" />
          <Stack.Screen name="(finance)" />
          <Stack.Screen
            name="comptes"
            options={{ headerShown: true, title: 'Comptes utilisateurs', presentation: 'modal' }}
          />
        </Stack.Protected>
      </Stack.Protected>
    </Stack>
  );
}
