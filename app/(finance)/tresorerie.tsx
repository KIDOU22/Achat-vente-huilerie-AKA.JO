import { Plus, Trash2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../src/auth/AuthContext';
import { Button } from '../../src/components/ui/Button';
import { Card } from '../../src/components/ui/Card';
import { TextField } from '../../src/components/ui/TextField';
import { useAppData } from '../../src/data/DataContext';
import { formatDateLabel, formatFCFA, formatTime } from '../../src/domain/format';
import { MODES_PAIEMENT, MODE_PAIEMENT_LABELS, type FinanceCategorieType, type ModePaiement } from '../../src/domain/types';
import { colors } from '../../src/theme/colors';
import { fonts } from '../../src/theme/typography';

export default function TresorerieScreen() {
  const { isManager } = useAuth();
  const { mouvementsTresorerie, financeCategories, budgets, ajouterMouvementTresorerie, supprimerMouvementTresorerie } = useAppData();

  const premierBudget = useMemo(
    () => (budgets.length > 0 ? [...budgets].sort((a, b) => a.annee - b.annee)[0] : undefined),
    [budgets]
  );

  // Solde cumulé calculé à l'affichage (chronologique croissant), jamais stocké —
  // même principe que soldeCaisse() côté caisses achats/ventes.
  const avecSoldeCumule = useMemo(() => {
    const asc = [...mouvementsTresorerie].sort((a, b) => a.ts - b.ts);
    let cumul = premierBudget?.soldeOuverture ?? 0;
    const parId = new Map<string, number>();
    for (const m of asc) {
      cumul += m.entree - m.sortie;
      parId.set(m.id, cumul);
    }
    return [...mouvementsTresorerie].sort((a, b) => b.ts - a.ts).map((m) => ({ m, cumul: parId.get(m.id) ?? 0 }));
  }, [mouvementsTresorerie, premierBudget]);

  const [formOuvert, setFormOuvert] = useState(false);
  const [sens, setSens] = useState<'entree' | 'sortie'>('sortie');
  const [libelle, setLibelle] = useState('');
  const [numPiece, setNumPiece] = useState('');
  const [categorieId, setCategorieId] = useState<string | null>(null);
  const [modePaiement, setModePaiement] = useState<ModePaiement>('caisse');
  const [montant, setMontant] = useState('');
  const [saving, setSaving] = useState(false);

  const typeAttendu: FinanceCategorieType = sens === 'entree' ? 'recette' : 'depense';
  const categoriesFiltrees = financeCategories.filter((c) => c.actif && c.type === typeAttendu);
  const categorieSelectionnee = categoriesFiltrees.find((c) => c.id === categorieId) ?? categoriesFiltrees[0];

  async function handleAjouter() {
    const montantNum = Math.round(Number(montant.replace(',', '.')) || 0);
    if (!libelle.trim() || !categorieSelectionnee || montantNum <= 0) {
      Alert.alert('Formulaire incomplet', 'Renseignez au moins le libellé, la catégorie et un montant supérieur à 0.');
      return;
    }
    setSaving(true);
    try {
      await ajouterMouvementTresorerie({
        ts: Date.now(),
        numPiece: numPiece.trim(),
        libelle: libelle.trim(),
        categorieId: categorieSelectionnee.id,
        modePaiement,
        entree: sens === 'entree' ? montantNum : 0,
        sortie: sens === 'sortie' ? montantNum : 0,
      });
      setFormOuvert(false);
      setLibelle('');
      setNumPiece('');
      setMontant('');
    } finally {
      setSaving(false);
    }
  }

  function confirmerSuppression(id: string) {
    Alert.alert('Supprimer ce mouvement ?', 'Cette action est irréversible.', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => supprimerMouvementTresorerie(id) },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {isManager && !formOuvert && (
        <Pressable onPress={() => setFormOuvert(true)} style={styles.nouveauBtn}>
          <Plus size={16} color={colors.onBackground} />
          <Text style={styles.nouveauBtnText}>Nouveau mouvement</Text>
        </Pressable>
      )}

      {formOuvert && isManager && (
        <Card style={{ gap: 12 }}>
          <Text style={styles.cardTitle}>Nouveau mouvement</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => setSens('entree')}
              style={[styles.chip, sens === 'entree' ? { backgroundColor: colors.frond } : styles.chipInactive]}
            >
              <Text style={[styles.chipText, { color: sens === 'entree' ? colors.onBackground : colors.textMuted }]}>Entrée</Text>
            </Pressable>
            <Pressable
              onPress={() => setSens('sortie')}
              style={[styles.chip, sens === 'sortie' ? { backgroundColor: colors.accent } : styles.chipInactive]}
            >
              <Text style={[styles.chipText, { color: sens === 'sortie' ? colors.onBackground : colors.textMuted }]}>Sortie</Text>
            </Pressable>
          </View>

          <TextField label="Libellé" value={libelle} onChangeText={setLibelle} placeholder="Ex. Vente huile de palme (CPO)" />
          <TextField label="N° pièce (optionnel)" value={numPiece} onChangeText={setNumPiece} />

          <View>
            <Text style={styles.label}>Catégorie</Text>
            <View style={styles.chipsRow}>
              {categoriesFiltrees.map((c) => {
                const active = c.id === categorieSelectionnee?.id;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setCategorieId(c.id)}
                    style={[styles.chip, active ? { backgroundColor: colors.text } : styles.chipInactive]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.onBackground : colors.textMuted }]}>{c.libelle}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <Text style={styles.label}>Mode de paiement</Text>
            <View style={styles.chipsRow}>
              {MODES_PAIEMENT.map((mode) => {
                const active = mode === modePaiement;
                return (
                  <Pressable
                    key={mode}
                    onPress={() => setModePaiement(mode)}
                    style={[styles.chip, active ? { backgroundColor: colors.text } : styles.chipInactive]}
                  >
                    <Text style={[styles.chipText, { color: active ? colors.onBackground : colors.textMuted }]}>
                      {MODE_PAIEMENT_LABELS[mode]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <TextField label="Montant (FCFA)" mono keyboardType="number-pad" value={montant} onChangeText={setMontant} placeholder="0" />

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Annuler" variant="outline" onPress={() => setFormOuvert(false)} style={{ flex: 1 }} />
            <Button label="Enregistrer" onPress={handleAjouter} loading={saving} style={{ flex: 1 }} />
          </View>
        </Card>
      )}

      {avecSoldeCumule.length === 0 ? (
        <Card>
          <Text style={styles.hint}>Aucun mouvement de trésorerie enregistré pour le moment.</Text>
        </Card>
      ) : (
        avecSoldeCumule.map(({ m, cumul }) => {
          const categorie = financeCategories.find((c) => c.id === m.categorieId);
          const estEntree = m.entree > 0;
          return (
            <Card key={m.id} style={{ gap: 6 }}>
              <View style={styles.rowHeader}>
                <Text style={styles.libelle}>{m.libelle}</Text>
                {isManager && (
                  <Pressable onPress={() => confirmerSuppression(m.id)} hitSlop={8}>
                    <Trash2 size={16} color={colors.textFaint} />
                  </Pressable>
                )}
              </View>
              <Text style={styles.meta}>
                {categorie?.libelle ?? '—'} · {MODE_PAIEMENT_LABELS[m.modePaiement]}
              </Text>
              <Text style={styles.meta}>
                {formatDateLabel(m.ts)} · {formatTime(m.ts)} · {m.createdByNom}
              </Text>
              <View style={styles.rowFooter}>
                <Text style={[styles.montant, { color: estEntree ? colors.frond : colors.accent }]}>
                  {estEntree ? '+' : '−'}
                  {formatFCFA(estEntree ? m.entree : m.sortie)}
                </Text>
                <Text style={styles.cumule}>Solde : {formatFCFA(cumul)}</Text>
              </View>
            </Card>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 12, paddingBottom: 60 },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
    marginBottom: 6,
  },
  hint: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.text },
  chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  chipInactive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipText: { fontFamily: fonts.bodyMedium, fontSize: 13 },
  nouveauBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.text,
    borderRadius: 10,
    paddingVertical: 14,
  },
  nouveauBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.onBackground },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  libelle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text, flex: 1 },
  meta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  rowFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  montant: { fontFamily: fonts.monoSemiBold, fontSize: 16 },
  cumule: { fontFamily: fonts.mono, fontSize: 11, color: colors.textFaint },
});
