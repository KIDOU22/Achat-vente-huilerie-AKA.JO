import { useSQLiteContext } from 'expo-sqlite';
import { ArrowLeftRight, Check, CornerUpLeft, Minus, Plus, Wallet } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/TextField';
import { useAppData } from '../data/DataContext';
import { listUsers } from '../db/repositories/users';
import { formatDateLabel, formatFCFA, formatTime } from '../domain/format';
import { MOUVEMENT_TYPE_LABELS, type Caisse, type MouvementCaisse, type User } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

type FormKind = 'apport' | 'allouer' | 'depense' | 'retour' | 'transfert' | null;

export function CaisseScreen() {
  const db = useSQLiteContext();
  const { currentUser, isManager } = useAuth();
  const {
    caisses,
    mouvements,
    soldeCaisse,
    enregistrerApport,
    allouerCaisse,
    enregistrerDepense,
    initierRetour,
    initierTransfert,
    validerMouvement,
    rejeterMouvement,
  } = useAppData();
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<FormKind>(null);
  const [cibleCaisseId, setCibleCaisseId] = useState<string | null>(null);
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [saving, setSaving] = useState(false);

  const refreshUsers = useCallback(() => {
    listUsers(db).then(setUsers);
  }, [db]);

  useEffect(() => {
    refreshUsers();
  }, [refreshUsers]);

  const userById = useCallback((id: string | null) => (id ? users.find((u) => u.id === id) : undefined), [users]);

  const nomCaisse = useCallback(
    (c: Caisse | undefined): string => {
      if (!c) return '—';
      if (c.type === 'principale') return 'Caisse principale';
      return userById(c.userId)?.nom ?? c.ownerIdentifiant ?? 'Utilisateur';
    },
    [userById]
  );

  const principale = caisses.find((c) => c.type === 'principale');
  const maCaisse = caisses.find((c) => c.userId === currentUser?.id);
  const autresCaisses = caisses.filter((c) => c.type === 'secondaire' && c.id !== maCaisse?.id);

  function resetForm() {
    setForm(null);
    setCibleCaisseId(null);
    setMontant('');
    setMotif('');
  }

  async function handleSubmit() {
    const montantNum = Number(montant.replace(',', '.'));
    if (!montantNum || montantNum <= 0 || !form) return;
    setSaving(true);
    try {
      if (form === 'apport' && principale) {
        await enregistrerApport(principale.id, montantNum, motif);
      } else if (form === 'allouer' && cibleCaisseId) {
        await allouerCaisse(cibleCaisseId, montantNum, motif);
      } else if (form === 'depense' && maCaisse) {
        if (!motif.trim()) return;
        await enregistrerDepense(maCaisse.id, montantNum, motif);
      } else if (form === 'retour' && maCaisse) {
        await initierRetour(maCaisse.id, montantNum, motif);
      } else if (form === 'transfert' && maCaisse && cibleCaisseId) {
        await initierTransfert(maCaisse.id, cibleCaisseId, montantNum, motif);
      }
      resetForm();
      refreshUsers();
    } finally {
      setSaving(false);
    }
  }

  function confirmValider(m: MouvementCaisse) {
    Alert.alert('Valider ce mouvement ?', `${MOUVEMENT_TYPE_LABELS[m.type]} — ${formatFCFA(m.montant)}`, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Rejeter', style: 'destructive', onPress: () => rejeterMouvement(m.id) },
      { text: 'Valider', onPress: () => validerMouvement(m.id) },
    ]);
  }

  // Retours en attente de validation par le Gérant.
  const retoursEnAttente = useMemo(
    () => mouvements.filter((m) => m.type === 'retour' && m.statut === 'en_attente'),
    [mouvements]
  );
  // Transferts en attente d'acceptation par le destinataire (moi).
  const transfertsRecus = useMemo(
    () => mouvements.filter((m) => m.type === 'transfert' && m.statut === 'en_attente' && m.caisseToId === maCaisse?.id),
    [mouvements, maCaisse]
  );
  // Mes propres opérations en attente (retour vers la principale, ou transfert envoyé).
  const mesEnAttente = useMemo(
    () =>
      mouvements.filter(
        (m) => m.statut === 'en_attente' && m.createdBy === currentUser?.id && m.caisseFromId === maCaisse?.id
      ),
    [mouvements, currentUser, maCaisse]
  );

  const historiqueMaCaisse = useMemo(
    () =>
      mouvements.filter(
        (m) => m.statut !== 'en_attente' && (m.caisseFromId === maCaisse?.id || m.caisseToId === maCaisse?.id)
      ),
    [mouvements, maCaisse]
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {isManager && principale && (
        <Card style={[styles.soldeCard, { borderColor: `${colors.oil}55` }]}>
          <View style={styles.soldeHeader}>
            <Wallet size={16} color={colors.oil} />
            <Text style={styles.soldeLabel}>Caisse principale</Text>
          </View>
          <Text style={[styles.soldeValue, { color: colors.oil }]}>{formatFCFA(soldeCaisse(principale.id))}</Text>
          <View style={styles.actionsRow}>
            <ActionChip label="Alimenter (dépôt)" icon={<Plus size={13} color={colors.oil} />} onPress={() => setForm('apport')} />
          </View>
        </Card>
      )}

      {maCaisse && (
        <Card style={styles.soldeCard}>
          <View style={styles.soldeHeader}>
            <Wallet size={16} color={colors.frond} />
            <Text style={styles.soldeLabel}>Ma caisse — {currentUser?.nom}</Text>
          </View>
          <Text style={[styles.soldeValue, { color: colors.text }]}>{formatFCFA(soldeCaisse(maCaisse.id))}</Text>
          <View style={styles.actionsRow}>
            <ActionChip label="Dépense" icon={<Minus size={13} color={colors.accent} />} onPress={() => setForm('depense')} />
            <ActionChip
              label="Retour caisse principale"
              icon={<CornerUpLeft size={13} color={colors.amber} />}
              onPress={() => setForm('retour')}
            />
            <ActionChip
              label="Transférer"
              icon={<ArrowLeftRight size={13} color={colors.frond} />}
              onPress={() => setForm('transfert')}
            />
          </View>
        </Card>
      )}

      {isManager && (
        <Card style={{ gap: 10 }}>
          <Text style={styles.cardTitle}>Alimenter une caisse</Text>
          <Button
            label="Allouer un montant"
            variant="outline"
            color={colors.oil}
            icon={<Plus size={16} color={colors.oil} />}
            onPress={() => setForm('allouer')}
          />
        </Card>
      )}

      {(form === 'allouer' || form === 'transfert') && (
        <Card style={{ gap: 10 }}>
          <Text style={styles.cardTitle}>
            {form === 'allouer' ? 'Choisir le destinataire' : 'Transférer à…'}
          </Text>
          <View style={styles.chipsWrap}>
            {(form === 'allouer' ? caisses.filter((c) => c.type === 'secondaire') : autresCaisses).map((c) => (
              <Pressable
                key={c.id}
                onPress={() => setCibleCaisseId(c.id)}
                style={[styles.userChip, cibleCaisseId === c.id && styles.userChipActive]}
              >
                <Text style={[styles.userChipText, cibleCaisseId === c.id && styles.userChipTextActive]}>
                  {nomCaisse(c)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Card>
      )}

      {form && (
        <Card style={{ gap: 10 }}>
          <Text style={styles.cardTitle}>
            {form === 'apport' && 'Alimenter la caisse principale'}
            {form === 'allouer' && 'Allocation'}
            {form === 'depense' && 'Nouvelle dépense'}
            {form === 'retour' && 'Retour vers la caisse principale'}
            {form === 'transfert' && 'Transfert'}
          </Text>
          <TextField label="Montant (F CFA)" value={montant} onChangeText={setMontant} keyboardType="number-pad" mono />
          <TextField
            label={form === 'depense' ? 'Motif (obligatoire)' : 'Motif (optionnel)'}
            value={motif}
            onChangeText={setMotif}
            placeholder="ex: Carburant moto"
          />
          <View style={styles.formActions}>
            <Button label="Annuler" variant="outline" color={colors.textMuted} onPress={resetForm} style={{ flex: 1 }} />
            <Button
              label="Enregistrer"
              onPress={handleSubmit}
              loading={saving}
              disabled={
                !montant ||
                Number(montant.replace(',', '.')) <= 0 ||
                ((form === 'allouer' || form === 'transfert') && !cibleCaisseId) ||
                (form === 'depense' && !motif.trim())
              }
              color={colors.frond}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      )}

      {transfertsRecus.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>Transferts à confirmer</Text>
          {transfertsRecus.map((m) => (
            <MouvementRow key={m.id} m={m} nomDe={nomCaisse} caisses={caisses} onPress={() => confirmValider(m)} />
          ))}
        </View>
      )}

      {isManager && retoursEnAttente.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>Retours à valider</Text>
          {retoursEnAttente.map((m) => (
            <MouvementRow key={m.id} m={m} nomDe={nomCaisse} caisses={caisses} onPress={() => confirmValider(m)} />
          ))}
        </View>
      )}

      {mesEnAttente.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>Mes opérations en attente</Text>
          {mesEnAttente.map((m) => (
            <MouvementRow key={m.id} m={m} nomDe={nomCaisse} caisses={caisses} />
          ))}
        </View>
      )}

      {isManager && (
        <View style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>Caisses des utilisateurs</Text>
          {autresCaisses.map((c) => (
            <Card key={c.id} style={styles.caisseRow}>
              <Text style={styles.caisseRowNom}>{nomCaisse(c)}</Text>
              <Text style={styles.caisseRowSolde}>{formatFCFA(soldeCaisse(c.id))}</Text>
            </Card>
          ))}
        </View>
      )}

      {historiqueMaCaisse.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={styles.sectionTitle}>Historique de ma caisse</Text>
          {historiqueMaCaisse.map((m) => (
            <MouvementRow key={m.id} m={m} nomDe={nomCaisse} caisses={caisses} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function ActionChip({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.actionChip}>
      {icon}
      <Text style={styles.actionChipText}>{label}</Text>
    </Pressable>
  );
}

function MouvementRow({
  m,
  nomDe,
  caisses,
  onPress,
}: {
  m: MouvementCaisse;
  nomDe: (c: Caisse | undefined) => string;
  caisses: Caisse[];
  onPress?: () => void;
}) {
  const from = caisses.find((c) => c.id === m.caisseFromId);
  const to = caisses.find((c) => c.id === m.caisseToId);
  const statutColor = m.statut === 'validee' ? colors.frond : m.statut === 'rejetee' ? colors.accent : colors.amber;
  const statutLabel = m.statut === 'validee' ? 'Validé' : m.statut === 'rejetee' ? 'Rejeté' : 'En attente';

  return (
    <Card style={{ gap: 6 }}>
      <View style={styles.mouvementHeader}>
        <Text style={styles.mouvementType}>{MOUVEMENT_TYPE_LABELS[m.type]}</Text>
        <View style={[styles.statutPill, { backgroundColor: `${statutColor}22` }]}>
          <Text style={[styles.statutPillText, { color: statutColor }]}>{statutLabel}</Text>
        </View>
      </View>
      <Text style={styles.mouvementMeta}>
        {nomDe(from)} → {nomDe(to)}
      </Text>
      {!!m.motif && <Text style={styles.mouvementMeta}>{m.motif}</Text>}
      <Text style={styles.mouvementMeta}>
        {formatDateLabel(m.ts)} · {formatTime(m.ts)} · {m.createdByNom}
      </Text>
      <View style={styles.mouvementFooter}>
        <Text style={styles.mouvementMontant}>{formatFCFA(m.montant)}</Text>
        {onPress && (
          <View style={styles.validationBtns}>
            <Pressable onPress={onPress} style={[styles.validationBtn, { backgroundColor: `${colors.frond}22` }]}>
              <Check size={14} color={colors.frond} />
            </Pressable>
          </View>
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 16, paddingBottom: 60 },
  soldeCard: { gap: 6 },
  soldeHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  soldeLabel: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.textMuted },
  soldeValue: { fontFamily: fonts.monoBold, fontSize: 24 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionChipText: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.text },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  userChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surfaceRaised,
  },
  userChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  userChipText: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted },
  userChipTextActive: { color: colors.onBackground },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  sectionTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
  },
  caisseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  caisseRowNom: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  caisseRowSolde: { fontFamily: fonts.monoSemiBold, fontSize: 14, color: colors.text },
  mouvementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  mouvementType: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.text },
  statutPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statutPillText: { fontFamily: fonts.bodyMedium, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  mouvementMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  mouvementFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  mouvementMontant: { fontFamily: fonts.monoSemiBold, fontSize: 14, color: colors.text },
  validationBtns: { flexDirection: 'row', gap: 8 },
  validationBtn: { borderRadius: 999, padding: 8 },
});
