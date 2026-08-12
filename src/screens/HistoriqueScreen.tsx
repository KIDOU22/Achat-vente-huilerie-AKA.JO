import { Check, ClipboardList, Lock, Undo2, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { TextField } from '../components/ui/TextField';
import { useAppData } from '../data/DataContext';
import { formatDateLabel, formatFCFA, formatTime } from '../domain/format';
import type { Pesee, Vente } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

type Row = { kind: 'pesee'; item: Pesee } | { kind: 'vente'; item: Vente };

export function HistoriqueScreen() {
  const { isElevated } = useAuth();
  const { pesees, ventes, planteurs, caisses, togglePaye, togglePayeVente, annulerPesee, annulerVente } = useAppData();
  const [motifCible, setMotifCible] = useState<{ kind: 'pesee' | 'vente'; id: string } | null>(null);
  const [motif, setMotif] = useState('');
  const [payerVenteCible, setPayerVenteCible] = useState<string | null>(null);

  const impayes = useMemo(() => pesees.filter((p) => !p.paye && !p.annulee), [pesees]);
  const impayesTotal = useMemo(() => impayes.reduce((s, p) => s + p.montant, 0), [impayes]);
  const planteurById = (id: string) => planteurs.find((p) => p.id === id);
  const caissePrincipale = caisses.find((c) => c.type === 'principale');
  const caisseBanque = caisses.find((c) => c.type === 'banque');

  function demanderAnnulation(kind: 'pesee' | 'vente', id: string) {
    setMotif('');
    setMotifCible({ kind, id });
  }

  function handleToggleVente(vente: Vente, paye: boolean) {
    if (paye) {
      // Le vendeur choisit la caisse destinataire avant que le paiement ne soit
      // effectif — voir la modale "Quelle caisse reçoit ce paiement ?" ci-dessous.
      setPayerVenteCible(vente.id);
    } else {
      togglePayeVente(vente.id, false);
    }
  }

  function confirmerPaiementVente(caisseId: string) {
    if (!payerVenteCible) return;
    togglePayeVente(payerVenteCible, true, caisseId);
    setPayerVenteCible(null);
  }

  function confirmerAnnulation() {
    if (!motifCible) return;
    const { kind, id } = motifCible;
    Alert.alert('Annuler cette opération ?', "Elle sera conservée dans l'historique mais exclue des totaux.", [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Confirmer',
        style: 'destructive',
        onPress: () => {
          if (kind === 'pesee') annulerPesee(id, motif);
          else annulerVente(id, motif);
          setMotifCible(null);
        },
      },
    ]);
  }

  const sections = useMemo(() => {
    const list: { title: string; data: Row[] }[] = [];
    if (pesees.length > 0) {
      list.push({ title: 'Achats de régimes', data: pesees.map((item) => ({ kind: 'pesee' as const, item })) });
    }
    if (ventes.length > 0) {
      list.push({ title: "Ventes d'huile", data: ventes.map((item) => ({ kind: 'vente' as const, item })) });
    }
    return list;
  }, [pesees, ventes]);

  return (
    <>
      <SectionList
        sections={sections}
        keyExtractor={(row) => row.item.id}
        style={styles.screen}
        contentContainerStyle={styles.container}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          impayes.length > 0 ? (
            <View style={styles.impayesBanner}>
              <Text style={styles.impayesText}>
                <Text style={styles.bold}>{impayes.length}</Text> pesée(s) en attente de paiement —{' '}
                {formatFCFA(impayesTotal)}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <ClipboardList size={32} color={colors.onBackgroundFaint} />
            <Text style={styles.emptyText}>Aucune opération enregistrée pour l'instant.</Text>
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
        renderItem={({ item: row }) =>
          row.kind === 'pesee' ? (
            <PeseeRow
              pesee={row.item}
              planteurNom={planteurById(row.item.planteurId)?.nom}
              onTogglePaye={togglePaye}
              isManager={isElevated}
              onAnnuler={() => demanderAnnulation('pesee', row.item.id)}
            />
          ) : (
            <VenteRow
              vente={row.item}
              isManager={isElevated}
              onTogglePaye={(paye) => handleToggleVente(row.item, paye)}
              onAnnuler={() => demanderAnnulation('vente', row.item.id)}
            />
          )
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 18 }} />}
      />

      <Modal visible={!!motifCible} transparent animationType="fade" onRequestClose={() => setMotifCible(null)}>
        <View style={styles.modalOverlay}>
          <Card style={{ width: '100%', maxWidth: 360, gap: 12 }}>
            <Text style={styles.cardTitleText}>Motif de l'annulation</Text>
            <TextField
              label="Motif (optionnel)"
              value={motif}
              onChangeText={setMotif}
              placeholder="ex: Erreur de saisie"
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Fermer" variant="outline" color={colors.textMuted} onPress={() => setMotifCible(null)} style={{ flex: 1 }} />
              <Button label="Annuler l'opération" onPress={confirmerAnnulation} color={colors.accent} style={{ flex: 1 }} />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal visible={!!payerVenteCible} transparent animationType="fade" onRequestClose={() => setPayerVenteCible(null)}>
        <View style={styles.modalOverlay}>
          <Card style={{ width: '100%', maxWidth: 360, gap: 12 }}>
            <Text style={styles.cardTitleText}>Quelle caisse reçoit ce paiement ?</Text>
            <View style={{ gap: 10 }}>
              <Button
                label="Caisse principale"
                onPress={() => caissePrincipale && confirmerPaiementVente(caissePrincipale.id)}
                disabled={!caissePrincipale}
                color={colors.oil}
              />
              <Button
                label="Banque"
                onPress={() => caisseBanque && confirmerPaiementVente(caisseBanque.id)}
                disabled={!caisseBanque}
                color={colors.amber}
              />
              <Button label="Annuler" variant="outline" color={colors.textMuted} onPress={() => setPayerVenteCible(null)} />
            </View>
          </Card>
        </View>
      </Modal>
    </>
  );
}

function PeseeRow({
  pesee,
  planteurNom,
  onTogglePaye,
  isManager,
  onAnnuler,
}: {
  pesee: Pesee;
  planteurNom: string | undefined;
  onTogglePaye: (id: string, paye: boolean) => Promise<void>;
  isManager: boolean;
  onAnnuler: () => void;
}) {
  return (
    <View style={[styles.card, pesee.annulee && styles.cardAnnulee]}>
      <View style={styles.cardHeader}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.cardTitle}>
            {planteurNom ?? '—'} <Text style={styles.cardTitleMuted}>· pesée n° {pesee.numTicketPesee}</Text>
          </Text>
          <Text style={styles.cardMeta}>
            {formatDateLabel(pesee.ts)} · {formatTime(pesee.ts)} · {pesee.typeVehicule} {pesee.immatriculation}
          </Text>
          <Text style={styles.cardMeta}>Chauffeur: {pesee.chauffeur} · Origine: {pesee.origine}</Text>
        </View>
        {pesee.annulee ? (
          <View style={styles.annuleePill}>
            <Text style={styles.annuleePillText}>Annulée</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => onTogglePaye(pesee.id, !pesee.paye)}
            style={[styles.payePill, { backgroundColor: pesee.paye ? `${colors.frond}33` : `${colors.accent}33` }]}
          >
            {pesee.paye ? <Check size={11} color={colors.frond} /> : <X size={11} color={colors.accent} />}
            <Text style={{ color: pesee.paye ? colors.frond : colors.accent, fontFamily: fonts.bodyMedium, fontSize: 11 }}>
              {pesee.paye ? 'Payé' : 'Impayé'}
            </Text>
          </Pressable>
        )}
      </View>
      {!!pesee.annulee && !!pesee.motifAnnulation && (
        <Text style={styles.motifAnnulationText}>Motif : {pesee.motifAnnulation}</Text>
      )}
      <View style={styles.cardFooter}>
        <Text style={styles.footerLeft}>
          {Math.round(pesee.net).toLocaleString('fr-FR')} kg net × {pesee.prixKg} F
        </Text>
        <Text style={styles.footerRight}>{formatFCFA(pesee.montant)}</Text>
      </View>
      {isManager && !pesee.annulee && (
        <Pressable onPress={onAnnuler} style={styles.annulerBtn} hitSlop={8}>
          <Undo2 size={12} color={colors.textFaint} />
          <Text style={styles.annulerBtnText}>Annuler l'opération</Text>
        </Pressable>
      )}
    </View>
  );
}

function VenteRow({
  vente,
  isManager,
  onTogglePaye,
  onAnnuler,
}: {
  vente: Vente;
  isManager: boolean;
  onTogglePaye: (paye: boolean) => void;
  onAnnuler: () => void;
}) {
  return (
    <View style={[styles.card, { borderColor: `${colors.oil}44` }, vente.annulee && styles.cardAnnulee]}>
      <View style={styles.cardHeader}>
        <View style={{ flexShrink: 1 }}>
          <Text style={styles.cardTitle}>
            {vente.client} <Text style={styles.cardTitleMuted}>· pesée n° {vente.numTicketPesee}</Text>
          </Text>
          <Text style={styles.cardMeta}>
            {formatDateLabel(vente.ts)} · {formatTime(vente.ts)} · {vente.typeVehicule} {vente.immatriculation}
          </Text>
          <Text style={styles.cardMeta}>Chauffeur: {vente.chauffeur}</Text>
        </View>
        {vente.annulee ? (
          <View style={styles.annuleePill}>
            <Text style={styles.annuleePillText}>Annulée</Text>
          </View>
        ) : (
          isManager && (
            <Pressable
              onPress={() => onTogglePaye(!vente.paye)}
              style={[styles.payePill, { backgroundColor: vente.paye ? `${colors.frond}33` : `${colors.accent}33` }]}
            >
              {vente.paye ? <Check size={11} color={colors.frond} /> : <X size={11} color={colors.accent} />}
              <Text style={{ color: vente.paye ? colors.frond : colors.accent, fontFamily: fonts.bodyMedium, fontSize: 11 }}>
                {vente.paye ? 'Payé' : 'Impayé'}
              </Text>
            </Pressable>
          )
        )}
      </View>
      {!!vente.annulee && !!vente.motifAnnulation && (
        <Text style={styles.motifAnnulationText}>Motif : {vente.motifAnnulation}</Text>
      )}
      <View style={styles.cardFooter}>
        <Text style={styles.footerLeft}>{Math.round(vente.net).toLocaleString('fr-FR')} kg net</Text>
        {isManager ? (
          <Text style={[styles.footerRight, { color: colors.oil }]}>{formatFCFA(vente.montant)}</Text>
        ) : (
          <View style={styles.lockedRow}>
            <Lock size={11} color={colors.textFaint} />
            <Text style={styles.lockedText}>gérant</Text>
          </View>
        )}
      </View>
      {isManager && !vente.annulee && (
        <Pressable onPress={onAnnuler} style={styles.annulerBtn} hitSlop={8}>
          <Undo2 size={12} color={colors.textFaint} />
          <Text style={styles.annulerBtnText}>Annuler l'opération</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 60 },
  impayesBanner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${colors.accent}55`,
    backgroundColor: `${colors.accent}1A`,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  impayesText: { color: colors.onBackground, fontFamily: fonts.body, fontSize: 13 },
  bold: { fontFamily: fonts.bodySemiBold },
  sectionTitle: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
    marginBottom: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cardAnnulee: { opacity: 0.55 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  cardTitleMuted: { fontFamily: fonts.body, color: colors.textFaint },
  cardMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  motifAnnulationText: { fontFamily: fonts.body, fontSize: 11, color: colors.accent, marginTop: 6, fontStyle: 'italic' },
  payePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  annuleePill: {
    backgroundColor: `${colors.accent}22`,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  annuleePillText: { color: colors.accent, fontFamily: fonts.bodyMedium, fontSize: 11 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footerLeft: { fontFamily: fonts.mono, fontSize: 13, color: colors.textMuted },
  footerRight: { fontFamily: fonts.monoSemiBold, fontSize: 13, color: colors.text },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lockedText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint },
  annulerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, alignSelf: 'flex-start' },
  annulerBtnText: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, textDecorationLine: 'underline' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.onBackgroundMuted },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cardTitleText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.text },
});
