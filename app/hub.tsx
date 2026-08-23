import { useRouter } from 'expo-router';
import { ChevronRight, Landmark, LogOut, Scale } from 'lucide-react-native';
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/AuthContext';
import { Card } from '../src/components/ui/Card';
import { RoleBadge } from '../src/components/ui/RoleBadge';
import { colors } from '../src/theme/colors';
import { fonts } from '../src/theme/typography';

const logo = require('../assets/images/logo-akajo.png');

// Point d'entrée pour Gérant/Dirigeant : choisir entre le module Achats & Ventes
// (existant, inchangé) et le nouveau module Finance & Comptabilité, plutôt qu'un
// 7ᵉ onglet — voir le plan de développement. Un agent n'accède jamais à cet écran
// (index.tsx le redirige directement vers /(tabs)/achat).
export default function HubScreen() {
  const { currentUser, logout } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
    >
      <View style={styles.header}>
        <View style={styles.logoWrap}>
          <Image source={logo} style={styles.logo} />
        </View>
        <Pressable onPress={logout} hitSlop={10}>
          <LogOut size={20} color={colors.onBackgroundMuted} />
        </Pressable>
      </View>

      <View style={styles.welcomeBlock}>
        <Text style={styles.eyebrow}>Huilerie Aka.Jo</Text>
        <Text style={styles.title}>Bonjour, {currentUser?.nom}</Text>
        {currentUser && <RoleBadge role={currentUser.role} />}
      </View>

      <Text style={styles.sectionLabel}>Que voulez-vous faire ?</Text>

      <Pressable onPress={() => router.push('/(tabs)/achat')}>
        <Card style={styles.optionCard}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.accent}1A` }]}>
            <Scale size={26} color={colors.accent} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Achats &amp; Ventes</Text>
            <Text style={styles.optionSubtitle}>Pesées, ventes d'huile, caisses, synthèse</Text>
          </View>
          <ChevronRight size={22} color={colors.textFaint} />
        </Card>
      </Pressable>

      <Pressable onPress={() => router.push('/(finance)/tableau-de-bord')}>
        <Card style={styles.optionCard}>
          <View style={[styles.iconWrap, { backgroundColor: `${colors.frond}1A` }]}>
            <Landmark size={26} color={colors.frond} />
          </View>
          <View style={styles.optionText}>
            <Text style={styles.optionTitle}>Finance &amp; Comptabilité</Text>
            <Text style={styles.optionSubtitle}>Budget, trésorerie, tableau de bord</Text>
          </View>
          <ChevronRight size={22} color={colors.textFaint} />
        </Card>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logoWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, overflow: 'hidden' },
  logo: { width: '100%', height: '100%' },
  welcomeBlock: { gap: 8, marginTop: 8, marginBottom: 8 },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
  },
  title: { fontFamily: fonts.heading, fontSize: 26, color: colors.onBackground },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
    marginTop: 8,
  },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  iconWrap: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionText: { flex: 1, gap: 2 },
  optionTitle: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.text },
  optionSubtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
});
