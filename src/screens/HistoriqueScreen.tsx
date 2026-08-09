import { Check, ClipboardList, Lock, X } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useAppData } from '../data/DataContext';
import { formatDateLabel, formatFCFA, formatTime } from '../domain/format';
import type { Pesee, Vente } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

type Row = { kind: 'pesee'; item: Pesee } | { kind: 'vente'; item: Vente };

export function HistoriqueScreen() {
  const { isManager } = useAuth();
  const { pesees, ventes, planteurs, togglePaye } = useAppData();

  const impayes = useMemo(() => pesees.filter((p) => !p.paye), [pesees]);
  const impayesTotal = useMemo(() => impayes.reduce((s, p) => s + p.montant, 0), [impayes]);
  const planteurById = (id: string) => planteurs.find((p) => p.id === id);

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
          <PeseeRow pesee={row.item} planteurNom={planteurById(row.item.planteurId)?.nom} onTogglePaye={togglePaye} />
        ) : (
          <VenteRow vente={row.item} isManager={isManager} />
        )
      }
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      SectionSeparatorComponent={() => <View style={{ height: 18 }} />}
    />
  );
}

function PeseeRow({
  pesee,
  planteurNom,
  onTogglePaye,
}: {
  pesee: Pesee;
  planteurNom: string | undefined;
  onTogglePaye: (id: string, paye: boolean) => Promise<void>;
}) {
  return (
    <View style={styles.card}>
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
        <Pressable
          onPress={() => onTogglePaye(pesee.id, !pesee.paye)}
          style={[styles.payePill, { backgroundColor: pesee.paye ? `${colors.frond}33` : `${colors.accent}33` }]}
        >
          {pesee.paye ? <Check size={11} color={colors.frond} /> : <X size={11} color={colors.accent} />}
          <Text style={{ color: pesee.paye ? colors.frond : colors.accent, fontFamily: fonts.bodyMedium, fontSize: 11 }}>
            {pesee.paye ? 'Payé' : 'Impayé'}
          </Text>
        </Pressable>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.footerLeft}>
          {Math.round(pesee.net).toLocaleString('fr-FR')} kg net × {pesee.prixKg} F
        </Text>
        <Text style={styles.footerRight}>{formatFCFA(pesee.montant)}</Text>
      </View>
    </View>
  );
}

function VenteRow({ vente, isManager }: { vente: Vente; isManager: boolean }) {
  return (
    <View style={[styles.card, { borderColor: `${colors.oil}44` }]}>
      <Text style={styles.cardTitle}>
        {vente.client} <Text style={styles.cardTitleMuted}>· pesée n° {vente.numTicketPesee}</Text>
      </Text>
      <Text style={styles.cardMeta}>
        {formatDateLabel(vente.ts)} · {formatTime(vente.ts)} · {vente.typeVehicule} {vente.immatriculation}
      </Text>
      <Text style={styles.cardMeta}>Chauffeur: {vente.chauffeur}</Text>
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.text },
  cardTitleMuted: { fontFamily: fonts.body, color: colors.textFaint },
  cardMeta: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  payePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
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
  empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontFamily: fonts.body, fontSize: 13, color: colors.onBackgroundMuted },
});
