import { Lock } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { BarChart } from '../components/BarChart';
import { useAppData } from '../data/DataContext';
import { buildBuckets, formatFCFA, formatTonnes, PERIODE_LABELS, periodKey } from '../domain/format';
import type { Metrique, Periode } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

const PERIODES: { key: Periode; label: string }[] = [
  { key: 'jour', label: 'Jour' },
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
  { key: 'annee', label: 'Année' },
];

export function SyntheseScreen() {
  const { isManager } = useAuth();

  if (!isManager) {
    return (
      <View style={styles.locked}>
        <Lock size={32} color={colors.onBackgroundFaint} />
        <Text style={styles.lockedTitle}>Accès réservé au gérant</Text>
        <Text style={styles.lockedSubtitle}>
          Les montants et la synthèse financière ne sont visibles que par le gérant.
        </Text>
      </View>
    );
  }

  return <SyntheseContent />;
}

function SyntheseContent() {
  const { pesees, ventes } = useAppData();
  const [periode, setPeriode] = useState<Periode>('jour');
  const [metrique, setMetrique] = useState<Metrique>('poids');

  const chartData = useMemo(() => {
    const buckets = buildBuckets(periode);
    const map = new Map(buckets.map((b) => [b.key, { ...b }]));
    for (const p of pesees) {
      if (p.annulee) continue;
      const k = periodKey(new Date(p.ts), periode);
      const b = map.get(k);
      if (b) {
        b.achatPoids += p.net;
        b.achatMontant += p.montant;
        b.transportRegimeMontant += p.montantTransport;
      }
    }
    for (const v of ventes) {
      if (v.annulee) continue;
      const k = periodKey(new Date(v.ts), periode);
      const b = map.get(k);
      if (b) {
        b.ventePoids += v.net;
        b.venteMontant += v.montant;
        b.transportHuileMontant += v.montantTransport;
      }
    }
    return Array.from(map.values());
  }, [pesees, ventes, periode]);

  const currentBucket = chartData[chartData.length - 1] ?? {
    achatPoids: 0,
    achatMontant: 0,
    ventePoids: 0,
    venteMontant: 0,
    transportRegimeMontant: 0,
    transportHuileMontant: 0,
  };
  const solde =
    currentBucket.venteMontant -
    currentBucket.achatMontant -
    currentBucket.transportRegimeMontant -
    currentBucket.transportHuileMontant;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View>
        <Text style={styles.label}>Période</Text>
        <View style={styles.periodeRow}>
          {PERIODES.map((p) => {
            const active = p.key === periode;
            return (
              <Pressable
                key={p.key}
                onPress={() => setPeriode(p.key)}
                style={[styles.periodeChip, active ? { backgroundColor: colors.text } : styles.periodeChipInactive]}
              >
                <Text style={[styles.periodeChipText, { color: active ? colors.onBackground : colors.textMuted }]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderColor: `${colors.accent}44` }]}>
          <Text style={styles.statLabel}>Achat régime — {PERIODE_LABELS[periode]}</Text>
          <Text style={[styles.statBig, { color: colors.accent }]}>{formatTonnes(currentBucket.achatPoids)}</Text>
          <Text style={styles.statSmall}>{formatFCFA(currentBucket.achatMontant)}</Text>
        </View>
        <View style={[styles.statCard, { borderColor: `${colors.oil}44` }]}>
          <Text style={styles.statLabel}>Vente huile — {PERIODE_LABELS[periode]}</Text>
          <Text style={[styles.statBig, { color: colors.oil }]}>{formatTonnes(currentBucket.ventePoids)}</Text>
          <Text style={styles.statSmall}>{formatFCFA(currentBucket.venteMontant)}</Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { borderColor: `${colors.frond}44` }]}>
          <Text style={styles.statLabel}>Transport régime — {PERIODE_LABELS[periode]}</Text>
          <Text style={[styles.statBig, { color: colors.frond }]}>{formatFCFA(currentBucket.transportRegimeMontant)}</Text>
        </View>
        <View style={[styles.statCard, { borderColor: `${colors.amber}44` }]}>
          <Text style={styles.statLabel}>Transport huile — {PERIODE_LABELS[periode]}</Text>
          <Text style={[styles.statBig, { color: colors.amber }]}>{formatFCFA(currentBucket.transportHuileMontant)}</Text>
        </View>
      </View>

      <View style={styles.soldeBox}>
        <Text style={styles.soldeLabel}>Solde (vente huile − achat régime − transports), {PERIODE_LABELS[periode]}</Text>
        <Text style={[styles.soldeValue, { color: solde >= 0 ? colors.frond : colors.accent }]}>{formatFCFA(solde)}</Text>
      </View>

      <View>
        <View style={styles.trendHeader}>
          <Text style={styles.label}>Tendance — {chartData.length} dernières périodes</Text>
          <View style={styles.metriqueToggle}>
            <Pressable
              onPress={() => setMetrique('poids')}
              style={[styles.metriqueBtn, metrique === 'poids' && styles.metriqueBtnActive]}
            >
              <Text style={[styles.metriqueText, metrique === 'poids' && styles.metriqueTextActive]}>Poids</Text>
            </Pressable>
            <Pressable
              onPress={() => setMetrique('montant')}
              style={[styles.metriqueBtn, metrique === 'montant' && styles.metriqueBtnActive]}
            >
              <Text style={[styles.metriqueText, metrique === 'montant' && styles.metriqueTextActive]}>Montant</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.chartCard}>
          <BarChart data={chartData} metrique={metrique} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 20, paddingBottom: 60 },
  locked: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 40 },
  lockedTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.onBackground },
  lockedSubtitle: { fontFamily: fonts.body, fontSize: 12, color: colors.onBackgroundMuted, textAlign: 'center' },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
    marginBottom: 8,
  },
  periodeRow: { flexDirection: 'row', gap: 8 },
  periodeChip: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  periodeChipInactive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  periodeChipText: { fontFamily: fonts.bodyMedium, fontSize: 12 },
  statsGrid: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  statLabel: { fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: colors.textFaint },
  statBig: { fontFamily: fonts.monoBold, fontSize: 18, marginTop: 4 },
  statSmall: { fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted },
  soldeBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  soldeLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  soldeValue: { fontFamily: fonts.monoBold, fontSize: 18 },
  trendHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  metriqueToggle: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: 'hidden' },
  metriqueBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  metriqueBtnActive: { backgroundColor: colors.text },
  metriqueText: { fontFamily: fonts.bodyMedium, fontSize: 10, color: colors.textMuted },
  metriqueTextActive: { color: colors.onBackground },
  chartCard: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12 },
});
