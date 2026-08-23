import { Plus } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { TextField } from '../../src/components/ui/TextField';
import { useAppData } from '../../src/data/DataContext';
import { formatFCFA } from '../../src/domain/format';
import type { FinanceCategorieType } from '../../src/domain/types';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/typography';

const MOIS_LABELS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];

export default function BudgetScreen() {
  const { isManager } = useAuth();
  const {
    budgets,
    budgetLignes,
    financeCategories,
    creerBudgetAnnuel,
    majLigneBudget,
    ajouterFinanceCategorie,
    renommerFinanceCategorie,
    toggleFinanceCategorieActif,
  } = useAppData();

  const now = useMemo(() => new Date(), []);
  const anneesDisponibles = useMemo(() => [...budgets].sort((a, b) => a.annee - b.annee).map((b) => b.annee), [budgets]);
  const [selectedYear, setSelectedYear] = useState<number | null>(anneesDisponibles[0] ?? null);
  const anneeActive = selectedYear ?? anneesDisponibles[anneesDisponibles.length - 1] ?? now.getFullYear();
  const budgetAnnee = budgets.find((b) => b.annee === anneeActive);

  const [creerForm, setCreerForm] = useState(false);
  const [nouvelleAnnee, setNouvelleAnnee] = useState(String(now.getFullYear()));
  const [nouveauSolde, setNouveauSolde] = useState('');
  const [creerSaving, setCreerSaving] = useState(false);

  const categoriesActives = financeCategories.filter((c) => c.actif);
  const [categorieSelectionnee, setCategorieSelectionnee] = useState<string | null>(categoriesActives[0]?.id ?? null);
  const categorieActive = categoriesActives.find((c) => c.id === categorieSelectionnee) ?? categoriesActives[0];

  const lignesCategorie = budgetAnnee
    ? budgetLignes.filter((l) => l.budgetId === budgetAnnee.id && l.categorieId === categorieActive?.id)
    : [];
  const montantParMois = (mois: number) => lignesCategorie.find((l) => l.mois === mois)?.montantPrevu ?? 0;
  const [cellText, setCellText] = useState<Record<number, string>>({});

  async function commitCell(mois: number) {
    if (!budgetAnnee || !categorieActive) return;
    const brut = cellText[mois];
    if (brut === undefined) return;
    const valeur = Math.max(0, Math.round(Number(brut.replace(',', '.')) || 0));
    await majLigneBudget(budgetAnnee.id, categorieActive.id, mois, valeur);
    setCellText((s) => {
      const next = { ...s };
      delete next[mois];
      return next;
    });
  }

  async function handleCreerBudget() {
    const annee = parseInt(nouvelleAnnee, 10);
    const solde = Number(nouveauSolde.replace(',', '.')) || 0;
    if (!annee) return;
    setCreerSaving(true);
    try {
      await creerBudgetAnnuel(annee, solde, Date.now());
      setCreerForm(false);
      setSelectedYear(annee);
      setNouveauSolde('');
    } finally {
      setCreerSaving(false);
    }
  }

  // Totaux mensuels : recettes/dépenses prévues, solde net, trésorerie prévisionnelle
  // cumulée — formules du §3.6 du cahier des charges, calculées à l'affichage.
  const totauxMensuels = useMemo(() => {
    if (!budgetAnnee) return [];
    let cumul = budgetAnnee.soldeOuverture;
    return Array.from({ length: 12 }, (_, i) => {
      const mois = i + 1;
      const lignesMois = budgetLignes.filter((l) => l.budgetId === budgetAnnee.id && l.mois === mois);
      const recettes = lignesMois
        .filter((l) => financeCategories.find((c) => c.id === l.categorieId)?.type === 'recette')
        .reduce((s, l) => s + l.montantPrevu, 0);
      const depenses = lignesMois
        .filter((l) => financeCategories.find((c) => c.id === l.categorieId)?.type === 'depense')
        .reduce((s, l) => s + l.montantPrevu, 0);
      const soldeNet = recettes - depenses;
      cumul += soldeNet;
      return { mois, recettes, depenses, soldeNet, cumul };
    });
  }, [budgetAnnee, budgetLignes, financeCategories]);

  const [nouvelleCategorieType, setNouvelleCategorieType] = useState<FinanceCategorieType>('depense');
  const [nouvelleCategorieLibelle, setNouvelleCategorieLibelle] = useState('');
  const [renommerId, setRenommerId] = useState<string | null>(null);
  const [renommerTexte, setRenommerTexte] = useState('');

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View>
        <Text style={styles.label}>Année</Text>
        <View style={styles.chipsRow}>
          {anneesDisponibles.map((annee) => {
            const active = annee === anneeActive;
            return (
              <Pressable
                key={annee}
                onPress={() => setSelectedYear(annee)}
                style={[styles.chip, active ? { backgroundColor: colors.text } : styles.chipInactive]}
              >
                <Text style={[styles.chipText, { color: active ? colors.onBackground : colors.textMuted }]}>{annee}</Text>
              </Pressable>
            );
          })}
          {isManager && (
            <Pressable onPress={() => setCreerForm((v) => !v)} style={[styles.chip, styles.chipInactive]}>
              <Plus size={14} color={colors.textMuted} />
              <Text style={[styles.chipText, { color: colors.textMuted }]}>Nouveau</Text>
            </Pressable>
          )}
        </View>
      </View>

      {creerForm && isManager && (
        <Card style={{ gap: 12 }}>
          <Text style={styles.cardTitle}>Nouveau budget annuel</Text>
          <TextField label="Année" mono keyboardType="number-pad" value={nouvelleAnnee} onChangeText={setNouvelleAnnee} />
          <TextField
            label="Solde de trésorerie d'ouverture (FCFA)"
            mono
            keyboardType="number-pad"
            value={nouveauSolde}
            onChangeText={setNouveauSolde}
            placeholder="0"
          />
          <Text style={styles.hint}>
            La date d'ouverture retenue est aujourd'hui. Pour la 1ʳᵉ année d'utilisation, c'est la date de mise en
            service ; les années suivantes reprendront le solde de clôture précédent.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Annuler" variant="outline" onPress={() => setCreerForm(false)} style={{ flex: 1 }} />
            <Button label="Créer" onPress={handleCreerBudget} loading={creerSaving} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      {!budgetAnnee ? (
        <Card>
          <Text style={styles.hint}>Aucun budget pour cette année. {isManager ? 'Créez-en un ci-dessus.' : ''}</Text>
        </Card>
      ) : (
        <>
          <View>
            <Text style={styles.label}>Catégorie</Text>
            <View style={styles.chipsRow}>
              {categoriesActives.map((c) => {
                const active = c.id === categorieActive?.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setCategorieSelectionnee(c.id)}
                    style={[
                      styles.chip,
                      active
                        ? { backgroundColor: c.type === 'recette' ? colors.frond : colors.accent }
                        : styles.chipInactive,
                    ]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.onBackground : colors.textMuted }]}>{c.libelle}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {categorieActive && (
            <Card style={{ gap: 10 }}>
              <Text style={styles.cardTitle}>{categorieActive.libelle}</Text>
              <View style={styles.grid}>
                {MOIS_LABELS.map((label, i) => {
                  const mois = i + 1;
                  const valeurActuelle = montantParMois(mois);
                  return (
                    <View key={mois} style={styles.gridCell}>
                      <Text style={styles.gridCellLabel}>{label}</Text>
                      {isManager ? (
                        <TextInput
                          style={styles.gridInput}
                          keyboardType="number-pad"
                          value={cellText[mois] ?? String(valeurActuelle || '')}
                          onChangeText={(t) => setCellText((s) => ({ ...s, [mois]: t }))}
                          onEndEditing={() => commitCell(mois)}
                          placeholder="0"
                          placeholderTextColor={colors.placeholder}
                        />
                      ) : (
                        <Text style={styles.gridReadonly}>{formatFCFA(valeurActuelle)}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </Card>
          )}

          <Card style={{ gap: 8 }}>
            <Text style={styles.cardTitle}>Totaux mensuels</Text>
            <View style={styles.totauxHeaderRow}>
              <Text style={[styles.totauxCell, styles.totauxHeaderText, { flex: 1.2 }]}>Mois</Text>
              <Text style={[styles.totauxCell, styles.totauxHeaderText]}>Recettes</Text>
              <Text style={[styles.totauxCell, styles.totauxHeaderText]}>Dépenses</Text>
              <Text style={[styles.totauxCell, styles.totauxHeaderText]}>Net</Text>
              <Text style={[styles.totauxCell, styles.totauxHeaderText]}>Cumul</Text>
            </View>
            {totauxMensuels.map((t) => (
              <View key={t.mois} style={styles.totauxRow}>
                <Text style={[styles.totauxCell, { flex: 1.2 }]}>{MOIS_LABELS[t.mois - 1]}</Text>
                <Text style={styles.totauxCell}>{formatFCFA(t.recettes)}</Text>
                <Text style={styles.totauxCell}>{formatFCFA(t.depenses)}</Text>
                <Text style={[styles.totauxCell, { color: t.soldeNet >= 0 ? colors.frond : colors.accent }]}>
                  {formatFCFA(t.soldeNet)}
                </Text>
                <Text style={[styles.totauxCell, { color: t.cumul >= 0 ? colors.frond : colors.accent }]}>{formatFCFA(t.cumul)}</Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {isManager && (
        <Card style={{ gap: 12 }}>
          <Text style={styles.cardTitle}>Gérer les catégories</Text>
          {financeCategories.map((c) => (
            <View key={c.id} style={styles.categorieRow}>
              {renommerId === c.id ? (
                <TextInput
                  style={styles.renommerInput}
                  value={renommerTexte}
                  onChangeText={setRenommerTexte}
                  autoFocus
                  onEndEditing={async () => {
                    if (renommerTexte.trim()) await renommerFinanceCategorie(c.id, renommerTexte.trim());
                    setRenommerId(null);
                  }}
                />
              ) : (
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => {
                    setRenommerId(c.id);
                    setRenommerTexte(c.libelle);
                  }}
                >
                  <Text style={[styles.categorieLibelle, !c.actif && { color: colors.textFaint }]}>{c.libelle}</Text>
                </Pressable>
              )}
              <Text style={[styles.categorieType, { color: c.type === 'recette' ? colors.frond : colors.accent }]}>
                {c.type === 'recette' ? 'Recette' : 'Dépense'}
              </Text>
              <Pressable onPress={() => toggleFinanceCategorieActif(c.id, !c.actif)} hitSlop={8}>
                <Text style={styles.categorieToggle}>{c.actif ? 'Désactiver' : 'Réactiver'}</Text>
              </Pressable>
            </View>
          ))}

          <View style={styles.nouvelleCategorieRow}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setNouvelleCategorieType('recette')}
                style={[styles.chip, nouvelleCategorieType === 'recette' ? { backgroundColor: colors.frond } : styles.chipInactive]}
              >
                <Text style={[styles.chipText, { color: nouvelleCategorieType === 'recette' ? colors.onBackground : colors.textMuted }]}>
                  Recette
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setNouvelleCategorieType('depense')}
                style={[styles.chip, nouvelleCategorieType === 'depense' ? { backgroundColor: colors.accent } : styles.chipInactive]}
              >
                <Text style={[styles.chipText, { color: nouvelleCategorieType === 'depense' ? colors.onBackground : colors.textMuted }]}>
                  Dépense
                </Text>
              </Pressable>
            </View>
            <TextInput
              style={styles.renommerInput}
              placeholder="Nouvelle catégorie…"
              placeholderTextColor={colors.placeholder}
              value={nouvelleCategorieLibelle}
              onChangeText={setNouvelleCategorieLibelle}
            />
            <Pressable
              onPress={async () => {
                if (!nouvelleCategorieLibelle.trim()) return;
                await ajouterFinanceCategorie(nouvelleCategorieType, nouvelleCategorieLibelle.trim());
                setNouvelleCategorieLibelle('');
              }}
              style={styles.ajouterCategorieBtn}
            >
              <Plus size={16} color={colors.onBackground} />
            </Pressable>
          </View>
        </Card>
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
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.text },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipInactive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridCell: { width: '22%', gap: 4 },
  gridCellLabel: { fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase', color: colors.textFaint },
  gridInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.text,
  },
  gridReadonly: { fontFamily: fonts.mono, fontSize: 13, color: colors.text, paddingVertical: 8 },
  totauxHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6 },
  totauxHeaderText: { fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase', color: colors.textFaint },
  totauxRow: { flexDirection: 'row', paddingVertical: 4 },
  totauxCell: { flex: 1, fontFamily: fonts.mono, fontSize: 11, color: colors.text },
  categorieRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  categorieLibelle: { fontFamily: fonts.body, fontSize: 13, color: colors.text },
  categorieType: { fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase' },
  categorieToggle: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.textMuted },
  renommerInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
  },
  nouvelleCategorieRow: { gap: 8, marginTop: 4 },
  ajouterCategorieBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.text,
    borderRadius: 8,
    padding: 10,
  },
});
