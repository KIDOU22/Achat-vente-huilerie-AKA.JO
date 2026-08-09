import { useRouter } from 'expo-router';
import { Lock, LogOut, UserCog } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../auth/AuthContext';
import { useAppData } from '../data/DataContext';
import { formatFCFA, formatTonnes, todayKey } from '../domain/format';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { RoleBadge } from './ui/RoleBadge';

const logo = require('../../assets/images/logo-akajo.png');

export function AppHeader() {
  const { currentUser, isManager, logout } = useAuth();
  const { pesees, ventes } = useAppData();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = todayKey();
  const todayPesees = useMemo(() => pesees.filter((p) => new Date(p.ts).toDateString() === today), [pesees, today]);
  const todayVentes = useMemo(() => ventes.filter((v) => new Date(v.ts).toDateString() === today), [ventes, today]);
  const totalTonnageJour = todayPesees.reduce((s, p) => s + p.net, 0);
  const totalAchatJour = todayPesees.reduce((s, p) => s + p.montant, 0);
  const totalVenteJour = todayVentes.reduce((s, v) => s + v.montant, 0);

  if (!currentUser) return null;

  return (
    <View style={{ backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTextBlock}>
          <Text style={styles.eyebrow}>Huilerie Aka.Jo — Pont-bascule</Text>
          <Text style={styles.title}>RÉGIMES &amp; HUILE</Text>
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
          {isManager && (
            <Pressable onPress={() => router.push('/comptes')} hitSlop={10}>
              <UserCog size={18} color={colors.onBackgroundMuted} />
            </Pressable>
          )}
          <Pressable onPress={logout} hitSlop={10}>
            <LogOut size={18} color={colors.onBackgroundMuted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.statsStrip}>
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>Régimes — jour</Text>
          <Text style={[styles.statValue, { color: colors.onBackground }]}>{formatTonnes(totalTonnageJour)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>Achats — jour</Text>
          <Text style={[styles.statValue, { color: colors.onBackground }]}>{formatFCFA(totalAchatJour)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.statCell}>
          <Text style={styles.statLabel}>Ventes huile</Text>
          {isManager ? (
            <Text style={[styles.statValue, { color: colors.onBackground }]}>{formatFCFA(totalVenteJour)}</Text>
          ) : (
            <Lock size={14} color={colors.onBackgroundFaint} />
          )}
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
  title: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.onBackground,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%' },
  userRow: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  userName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.onBackground },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  statsStrip: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  statCell: { flex: 1, gap: 2 },
  statLabel: { fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: colors.onBackgroundFaint },
  statValue: { fontFamily: fonts.mono, fontSize: 17, fontWeight: '600' },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle, marginHorizontal: 8 },
});
