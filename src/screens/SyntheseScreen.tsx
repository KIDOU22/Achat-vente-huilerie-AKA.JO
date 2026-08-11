import { useSQLiteContext } from 'expo-sqlite';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { BarChart } from '../components/BarChart';
import { useAppData } from '../data/DataContext';
import { listUsers } from '../db/repositories/users';
import { buildBuckets, formatFCFA, formatTonnes, PERIODE_LABELS, periodKey } from '../domain/format';
import type { Metrique, Periode, User } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

const PERIODES: { key: Periode; label: string }[] = [
  { key: 'jour', label: 'Jour' },
  { key: 'semaine', label: 'Semaine' },
  { key: 'mois', label: 'Mois' },
  { key: 'annee', label: 'Année' },
];

function PeriodeSelector({ periode, onChange }: { periode: Periode; onChange: (p: Periode) => void }) {
  return (
    <View>
      <Text style={styles.label}>Période</Text>
      <View style={styles.periodeRow}>
        {PERIODES.map((p) => {
          const active = p.key === periode;
          return (
            <Pressable
              key={p.key}
              onPress={() => onChange(p.key)}
              style={[styles.periodeChip, active ? { backgroundColor: colors.text } : styles.periodeChipInactive]}
            >
              <Text style={[styles.periodeChipText, { color: active ? colors.onBackground : colors.textMuted }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SyntheseScreen() {
  const { isElevated } = useAuth();
  return isElevated ? <SyntheseContent /> : <SyntheseAgentContent />;
}

function SyntheseAgentContent() {
  const { pesees } = useAppData();
  const { currentUser } = useAuth();
  const [periode, setPeriode] = useState<Periode>('jour');

  const mesPesees = useMemo(
    () => pesees.filter((p) => !p.annulee && p.createdBy === currentUser?.id),
    [pesees, currentUser]
  );

  const currentBucket = useMemo(() => {
    const nowKey = periodKey(new Date(), periode);
    let poids = 0;
    let montant = 0;
    let count = 0;
    for (const p of mesPesees) {
      if (periodKey(new Date(p.ts), periode) === nowKey) {
        poids += p.net;
        montant += p.montant;
        count += 1;
      }
    }
    return { poids, montant, count };
  }, [mesPesees, periode]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <PeriodeSelector periode={periode} onChange={setPeriode} />

      <View style={[styles.statCard, { borderColor: `${colors.accent}44` }]}>
        <Text style={styles.statLabel}>Mes achats — {PERIODE_LABELS[periode]}</Text>
        <Text style={[styles.statBig, { color: colors.accent }]}>{formatTonnes(currentBucket.poids)}</Text>
        <Text style={styles.statSmall}>
          {formatFCFA(currentBucket.montant)} · {currentBucket.count} pesée{currentBucket.count > 1 ? 's' : ''}
        </Text>
      </View>
    </ScrollView>
  );
}

function SyntheseContent() {
  const { pesees, ventes, planteurs } = useAppData();
  const db = useSQLiteContext();
  const [users, setUsers] = useState<User[]>([]);
  const [periode, setPeriode] = useState<Periode>('jour');
  const [metrique, setMetrique] = useState<Metrique>('poids');

  useEffect(() => {
    listUsers(db).then(setUsers);
  }, [db]);

  const periodePesees = useMemo(() => {
    const nowKey = periodKey(new Date(), periode);
    return pesees.filter((p) => !p.annulee && periodKey(new Date(p.ts), periode) === nowKey);
  }, [pesees, periode]);

  const parAgent = useMemo(() => {
    const map = new Map<string, { nom: string; poids: number; montant: number; count: number }>();
    for (const p of periodePesees) {
      const nom = users.find((u) => u.id === p.createdBy)?.nom ?? 'Inconnu';
      const cur = map.get(p.createdBy) ?? { nom, poids: 0, montant: 0, count: 0 };
      cur.poids += p.net;
      cur.montant += p.montant;
      cur.count += 1;
      map.set(p.createdBy, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.poids - a.poids);
  }, [periodePesees, users]);

  const parPlanteur = useMemo(() => {
    const map = new Map<string, { nom: string; poids: number; count: number }>();
    for (const p of periodePesees) {
      const nom = planteurs.find((pl) => pl.id === p.planteurId)?.nom ?? 'Inconnu';
      const cur = map.get(p.planteurId) ?? { nom, poids: 0, count: 0 };
      cur.poids += p.net;
      cur.count += 1;
      map.set(p.planteurId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.poids - a.poids);
  }, [periodePesees, planteurs]);

  const parChauffeur = useMemo(() => {
    const map = new Map<string, { poids: number; count: number }>();
    for (const p of periodePesees) {
      const key = p.chauffeur || '—';
      const cur = map.get(key) ?? { poids: 0, count: 0 };
      cur.poids += p.net;
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.entries())
      .map(([chauffeur, v]) => ({ chauffeur, ...v }))
      .sort((a, b) => b.poids - a.poids);
  }, [periodePesees]);

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
      <PeriodeSelector periode={periode} onChange={setPeriode} />

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

      <BreakdownCard
        title={`Achats par agent — ${PERIODE_LABELS[periode]}`}
        rows={parAgent.map((r) => ({ label: r.nom, poids: r.poids, sub: `${formatFCFA(r.montant)} · ${r.count} pesée${r.count > 1 ? 's' : ''}` }))}
      />

      <BreakdownCard
        title={`Achats par planteur — ${PERIODE_LABELS[periode]}`}
        rows={parPlanteur.map((r) => ({ label: r.nom, poids: r.poids, sub: `${r.count} pesée${r.count > 1 ? 's' : ''}` }))}
      />

      <BreakdownCard
        title={`Achats par chauffeur — ${PERIODE_LABELS[periode]}`}
        rows={parChauffeur.map((r) => ({ label: r.chauffeur, poids: r.poids, sub: `${r.count} pesée${r.count > 1 ? 's' : ''}` }))}
      />
    </ScrollView>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { label: string; poids: number; sub: string }[] }) {
  return (
    <View>
      <Text style={styles.label}>{title}</Text>
      <View style={styles.breakdownCard}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>Aucun achat sur cette période</Text>
        ) : (
          rows.map((row, i) => (
            <View key={row.label} style={[styles.breakdownRow, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
              <Text style={styles.breakdownName}>{row.label}</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.breakdownValue}>{formatTonnes(row.poids)}</Text>
                <Text style={styles.breakdownSub}>{row.sub}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 20, paddingBottom: 60 },
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
  breakdownCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  breakdownName: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.text, flexShrink: 1, marginRight: 12 },
  breakdownValue: { fontFamily: fonts.monoSemiBold, fontSize: 13, color: colors.amber },
  breakdownSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, paddingVertical: 16 },
});
