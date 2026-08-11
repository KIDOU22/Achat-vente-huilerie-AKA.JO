import type { SQLiteDatabase } from 'expo-sqlite';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import React, { useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/auth/AuthContext';
import { DataProvider } from '../src/data/DataContext';
import { DATABASE_NAME, migrate } from '../src/db/schema';
import { colors } from '../src/theme/colors';
import { useAppFonts } from '../src/theme/useAppFonts';
import { LoadingScreen } from '../src/screens/LoadingScreen';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { fontsLoaded, fontsError } = useAppFonts();

  const initDatabase = useCallback(async (db: SQLiteDatabase) => {
    await migrate(db);
    await SplashScreen.hideAsync();
  }, []);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase}>
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
