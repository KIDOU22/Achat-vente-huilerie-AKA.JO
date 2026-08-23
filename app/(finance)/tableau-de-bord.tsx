import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/ui/Card';
import { useAppData } from '../../src/data/DataContext';
import { financePeriodBounds, financePeriodLabel, formatFCFA } from '../../src/domain/format';
import type { FinancePeriode } from '../../src/domain/types';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/typography';

const PERIODES: { key: FinancePeriode; label: string }[] = [
  { key: 'mois', label: 'Mois' },
  { key: 'trimestre', label: 'Trimestre' },
  { key: 'annee', label: 'Année' },
];

function PeriodeSelector({ periode, onChange }: { periode: FinancePeriode; onChange: (p: FinancePeriode) => void }) {
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

function moisDeLaPeriode(date: Date, periode: FinancePeriode): number[] {
  const mois = date.getMonth() + 1;
  if (periode === 'mois') return [mois];
  if (periode === 'trimestre') {
    const q = Math.floor((mois - 1) / 3);
    return [q * 3 + 1, q * 3 + 2, q * 3 + 3];
  }
  return Array.from({ length: 12 }, (_, i) => i + 1);
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card style={[styles.statCard, { borderColor: `${color}44` }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </Card>
  );
}

export default function TableauDeBordScreen() {
  const { budgets, budgetLignes, financeCategories, mouvementsTresorerie } = useAppData();
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [periode, setPeriode] = useState<FinancePeriode>('mois');

  const referenceDate = useMemo(() => new Date(selectedYear, now.getMonth(), now.getDate()), [selectedYear, now]);
  const budgetAnnee = budgets.find((b) => b.annee === selectedYear);

  // Solde de trésorerie actuel : flux continu depuis l'ouverture du tout premier
  // budget créé, quelle que soit l'année sélectionnée pour le reste de l'écran —
  // c'est la même logique que soldeCaisse() (cumul depuis une ouverture), pas une
  // remise à zéro chaque année.
  const premierBudget = useMemo(
    () => (budgets.length > 0 ? [...budgets].sort((a, b) => a.annee - b.annee)[0] : undefined),
    [budgets]
  );
  const soldeActuel = useMemo(() => {
    if (!premierBudget) return null;
    const cumulMouvements = mouvementsTresorerie.reduce((s, m) => s + m.entree - m.sortie, 0);
    return premierBudget.soldeOuverture + cumulMouvements;
  }, [premierBudget, mouvementsTresorerie]);

  const { start, end } = financePeriodBounds(referenceDate, periode);
  const mouvementsPeriode = mouvementsTresorerie.filter((m) => m.ts >= start && m.ts < end);
  const totalRecettesRealisees = mouvementsPeriode.reduce((s, m) => s + m.entree, 0);
  const totalDepensesRealisees = mouvementsPeriode.reduce((s, m) => s + m.sortie, 0);

  const moisPeriode = moisDeLaPeriode(referenceDate, periode);
  const lignesBudgetPeriode = budgetAnnee
    ? budgetLignes.filter((l) => l.budgetId === budgetAnnee.id && moisPeriode.includes(l.mois))
    : [];
  const categorieById = (id: string) => financeCategories.find((c) => c.id === id);
  const totalRecettesPrevues = lignesBudgetPeriode
    .filter((l) => categorieById(l.categorieId)?.type === 'recette')
    .reduce((s, l) => s + l.montantPrevu, 0);
  const totalDepensesPrevues = lignesBudgetPeriode
    .filter((l) => categorieById(l.categorieId)?.type === 'depense')
    .reduce((s, l) => s + l.montantPrevu, 0);
  const soldeNetPrevu = totalRecettesPrevues - totalDepensesPrevues;
  const ecartRecettes = totalRecettesRealisees - totalRecettesPrevues;
  const ecartDepenses = totalDepensesRealisees - totalDepensesPrevues;

  const anneesDisponibles = [...budgets].sort((a, b) => a.annee - b.annee).map((b) => b.annee);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {anneesDisponibles.length === 0 ? (
        <Card style={{ gap: 12, alignItems: 'center' }}>
          <Text style={styles.emptyText}>Aucun budget créé pour le moment.</Text>
          <Pressable onPress={() => router.push('/(finance)/budget')} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>Créer le budget annuel</Text>
          </Pressable>
        </Card>
      ) : (
        <>
          <View>
            <Text style={styles.label}>Année</Text>
            <View style={styles.periodeRow}>
              {anneesDisponibles.map((annee) => {
                const active = annee === selectedYear;
                return (
                  <Pressable
                    key={annee}
                    onPress={() => setSelectedYear(annee)}
                    style={[styles.periodeChip, active ? { backgroundColor: colors.text } : styles.periodeChipInactive]}
                  >
                    <Text style={[styles.periodeChipText, { color: active ? colors.onBackground : colors.textMuted }]}>{annee}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <PeriodeSelector periode={periode} onChange={setPeriode} />

          <Card style={styles.soldeCard}>
            <Text style={styles.soldeLabel}>Solde de trésorerie actuel</Text>
            <Text style={[styles.soldeValue, { color: (soldeActuel ?? 0) >= 0 ? colors.frond : colors.accent }]}>
              {soldeActuel !== null ? formatFCFA(soldeActuel) : '—'}
            </Text>
            <Text style={styles.soldePeriodeLabel}>Pour {financePeriodLabel(referenceDate, periode)}</Text>
          </Card>

          <View style={styles.statsGrid}>
            <StatCard label="Recettes réalisées" value={formatFCFA(totalRecettesRealisees)} color={colors.frond} />
            <StatCard label="Dépenses réalisées" value={formatFCFA(totalDepensesRealisees)} color={colors.accent} />
          </View>
          <View style={styles.statsGrid}>
            <StatCard label="Écart recettes" value={formatFCFA(ecartRecettes)} color={ecartRecettes >= 0 ? colors.frond : colors.accent} />
            <StatCard label="Écart dépenses" value={formatFCFA(ecartDepenses)} color={ecartDepenses <= 0 ? colors.frond : colors.accent} />
          </View>
          <View style={styles.statsGrid}>
            <StatCard label="Solde net prévu" value={formatFCFA(soldeNetPrevu)} color={soldeNetPrevu >= 0 ? colors.frond : colors.accent} />
            <StatCard label="Recettes prévues" value={formatFCFA(totalRecettesPrevues)} color={colors.oil} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 16, paddingBottom: 60 },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
    marginBottom: 6,
  },
  periodeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  periodeChip: { flexGrow: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  periodeChipInactive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  periodeChipText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  soldeCard: { backgroundColor: colors.surfaceRaised, gap: 4 },
  soldeLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.textFaint,
  },
  soldeValue: { fontFamily: fonts.monoBold, fontSize: 28 },
  soldePeriodeLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  statsGrid: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, borderWidth: 1, gap: 4 },
  statLabel: { fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: colors.textFaint },
  statValue: { fontFamily: fonts.monoSemiBold, fontSize: 16 },
  emptyText: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  emptyButton: { backgroundColor: colors.text, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 20 },
  emptyButtonText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.onBackground },
});
