import { useRouter } from 'expo-router';
import { LogOut, RefreshCw, Scale } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef } from 'react';
import { Alert, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { useAppData } from '../data/DataContext';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { RoleBadge } from './ui/RoleBadge';

const logo = require('../../assets/images/logo-akajo.png');

// Header dédié au module Finance & Comptabilité — plus léger que AppHeader (pas
// de "chiffres du jour" achats/ventes, sans objet ici), mais mêmes conventions
// (logo, nom/rôle, synchro, déconnexion) plus un bouton pour revenir au module
// Achats/Ventes sans repasser par le hub.
export function FinanceHeader() {
  const { currentUser, logout } = useAuth();
  const { syncing, synchroniserMaintenant } = useAppData();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const rotation = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!syncing) {
      rotation.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.timing(rotation, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })
    );
    anim.start();
    return () => anim.stop();
  }, [syncing, rotation]);
  const rotateStyle = useMemo(
    () => ({ transform: [{ rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }),
    [rotation]
  );

  async function handleSync() {
    const r = await synchroniserMaintenant();
    Alert.alert(r.ok ? 'Synchronisation' : 'Synchronisation échouée', r.message);
  }

  if (!currentUser) return null;

  return (
    <View style={{ backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.eyebrow}>Huilerie Aka.Jo — Finance</Text>
          <Text style={styles.title}>COMPTABILITÉ</Text>
        </View>
        <View style={styles.logoWrap}>
          <Image source={logo} style={styles.logo} />
        </View>
      </View>

      <View style={styles.userRow}>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{currentUser.nom}</Text>
          <RoleBadge role={currentUser.role} />
        </View>
        <View style={styles.actions}>
          <Pressable onPress={handleSync} disabled={syncing} hitSlop={10}>
            <Animated.View style={rotateStyle}>
              <RefreshCw size={18} color={syncing ? colors.onBackgroundFaint : colors.onBackgroundMuted} />
            </Animated.View>
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/achat')} hitSlop={10}>
            <Scale size={18} color={colors.onBackgroundMuted} />
          </Pressable>
          <Pressable onPress={logout} hitSlop={10}>
            <LogOut size={18} color={colors.onBackgroundMuted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  headerTextBlock: { flexShrink: 1 },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
  },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.onBackground, marginTop: 2, letterSpacing: 0.5 },
  logoWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, overflow: 'hidden' },
  logo: { width: '100%', height: '100%' },
  userRow: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.onBackground },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
});
