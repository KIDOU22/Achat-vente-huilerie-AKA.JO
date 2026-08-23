import { useLocalSearchParams } from 'expo-router';
import { Check, Wallet } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Row } from '../components/ui/Row';
import { TextField } from '../components/ui/TextField';
import { useAppData } from '../data/DataContext';
import { formatFCFA, formatTonnes } from '../domain/format';
import { statsPartenaire, statsVide } from '../domain/partenaires';
import { PARTENAIRE_TYPE_LABELS } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

export function PartenaireDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isManager } = useAuth();
  const { partenaires, pesees, ventes, mouvements, caisses, enregistrerReglement } = useAppData();

  const partenaire = partenaires.find((p) => p.id === id);
  const stats = useMemo(
    () => (partenaire ? statsPartenaire(partenaire, pesees, ventes, mouvements) : statsVide(id ?? '')),
    [partenaire, pesees, ventes, mouvements, id]
  );
  const volet = partenaire?.type === 'chauffeur' ? 'transport' : 'produit';

  const caissePrincipale = caisses.find((c) => c.type === 'principale');
  const caisseBanque = caisses.find((c) => c.type === 'banque');

  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [saving, setSaving] = useState(false);

  if (!partenaire) {
    return (
      <View style={styles.locked}>
        <Text style={styles.lockedText}>Partenaire introuvable.</Text>
      </View>
    );
  }

  async function handleReglement(caisseId: string) {
    const montantNum = Number(montant.replace(',', '.'));
    if (!montantNum || montantNum <= 0 || !partenaire) return;
    setSaving(true);
    try {
      await enregistrerReglement({ partenaireId: partenaire.id, volet, montant: montantNum, caisseId, motif });
      setMontant('');
      setMotif('');
    } catch (err) {
      Alert.alert('Règlement impossible', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Card style={{ gap: 10 }}>
        <View style={styles.headerRow}>
          <Text style={styles.nom}>{partenaire.nom}</Text>
          <View style={styles.typePill}>
            <Text style={styles.typePillText}>{PARTENAIRE_TYPE_LABELS[partenaire.type]}</Text>
          </View>
        </View>
        {partenaire.type === 'planteur' && <Row label="Village / zone" value={partenaire.village} />}
        {partenaire.type === 'pont_independant' && (
          <>
            <Row label="Localisation" value={partenaire.localisation} />
            <Row label="Responsable / contact" value={partenaire.responsable} />
          </>
        )}
        <Row label="Téléphone" value={partenaire.tel} />
      </Card>

      <Card style={{ gap: 12 }}>
        <Text style={styles.cardTitle}>Activité (toutes périodes)</Text>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Tonnage livré</Text>
            <Text style={styles.statValue}>{formatTonnes(stats.tonnage)}</Text>
            <Text style={styles.statSub}>{stats.livraisons} livraison{stats.livraisons > 1 ? 's' : ''}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Montant dû</Text>
            <Text style={styles.statValue}>{formatFCFA(stats.montantDu)}</Text>
          </View>
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Montant reçu</Text>
            <Text style={[styles.statValue, { color: colors.frond }]}>{formatFCFA(stats.montantPaye)}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Solde</Text>
            <Text style={[styles.statValue, { color: stats.solde > 0 ? colors.accent : colors.frond }]}>
              {stats.solde > 0 ? `${formatFCFA(stats.solde)} impayé` : stats.solde < 0 ? `${formatFCFA(-stats.solde)} créance` : 'Soldé'}
            </Text>
          </View>
        </View>
      </Card>

      {isManager && stats.solde !== 0 && (
        <Card style={{ gap: 10 }}>
          <Text style={styles.cardTitle}>Enregistrer un paiement</Text>
          <Text style={styles.hint}>
            Avance, solde en plusieurs fois, ou règlement groupé de plusieurs livraisons — le montant vient réduire
            le solde global ci-dessus.
          </Text>
          <TextField label="Montant (F CFA)" value={montant} onChangeText={setMontant} keyboardType="number-pad" mono />
          <TextField label="Motif (optionnel)" value={motif} onChangeText={setMotif} placeholder="ex: Avance sur livraisons" />
          <View style={{ gap: 10 }}>
            <Button
              label="Payer depuis la caisse principale"
              onPress={() => caissePrincipale && handleReglement(caissePrincipale.id)}
              disabled={!caissePrincipale || !montant}
              loading={saving}
              color={colors.oil}
              icon={<Wallet size={16} color={colors.onBackground} />}
            />
            <Button
              label="Payer depuis la banque"
              onPress={() => caisseBanque && handleReglement(caisseBanque.id)}
              disabled={!caisseBanque || !montant}
              loading={saving}
              variant="outline"
              color={colors.amber}
              icon={<Check size={16} color={colors.amber} />}
            />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 14, paddingBottom: 60 },
  locked: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  lockedText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.onBackground },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nom: { fontFamily: fonts.heading, fontSize: 18, color: colors.text, flexShrink: 1, marginRight: 10 },
  typePill: { backgroundColor: `${colors.frond}22`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  typePillText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.frond },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  statsGrid: { flexDirection: 'row', gap: 12 },
  statBox: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  statLabel: { fontFamily: fonts.mono, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: colors.textFaint },
  statValue: { fontFamily: fonts.monoBold, fontSize: 16, marginTop: 4, color: colors.text },
  statSub: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  hint: { fontFamily: fonts.body, fontSize: 11, color: colors.textMuted, lineHeight: 15 },
});
