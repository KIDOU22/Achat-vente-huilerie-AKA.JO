import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { formatDateLabel, formatFCFA, formatKg, formatTime } from '../domain/format';
import type { Pesee, Planteur, Vente } from '../domain/types';
import { Row } from './ui/Row';
import { LockedLabel } from './ui/LockedValue';

export function AchatTicketCard({ t, planteur }: { t: Pesee; planteur: Planteur | undefined }) {
  return (
    <View style={[styles.card, { borderColor: `${colors.accent}55` }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.accent }]}>Ticket d'achat #{t.num}</Text>
        <Text style={styles.amount}>{formatFCFA(t.montant)}</Text>
      </View>
      <Row label="Planteur" value={planteur?.nom ?? '—'} bold />
      <Row label="Date" value={`${formatDateLabel(t.ts)}, ${formatTime(t.ts)}`} />
      <Row label="N° pesée" value={t.numTicketPesee} bold />
      <Row label="Origine" value={t.origine} />
      <Row label="Chauffeur" value={t.chauffeur} />
      <Row label="Véhicule" value={`${t.typeVehicule} · ${t.immatriculation}`} />
      <Row label="Poids en charge" value={formatKg(t.poidsCharge)} />
      <Row label="Poids à vide" value={formatKg(t.poidsVide)} />
      <Row label="Poids net" value={formatKg(t.net)} bold />
      <Row label="Prix/kg" value={formatFCFA(t.prixKg)} />
      <View style={[styles.statusPill, { backgroundColor: t.paye ? `${colors.frond}33` : `${colors.accent}33` }]}>
        <Text style={{ color: t.paye ? colors.frond : colors.accent, fontFamily: fonts.bodyMedium, fontSize: 12 }}>
          {t.paye ? 'Payé' : 'Impayé'}
        </Text>
      </View>
    </View>
  );
}

export function VenteTicketCard({ t, isManager }: { t: Vente; isManager: boolean }) {
  return (
    <View style={[styles.card, { borderColor: `${colors.oil}55` }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.oil }]}>Ticket de vente #{t.num}</Text>
        {isManager ? <Text style={styles.amount}>{formatFCFA(t.montant)}</Text> : <LockedLabel />}
      </View>
      <Row label="Client" value={t.client} bold />
      <Row label="Date" value={`${formatDateLabel(t.ts)}, ${formatTime(t.ts)}`} />
      <Row label="N° pesée" value={t.numTicketPesee} bold />
      <Row label="Chauffeur" value={t.chauffeur} />
      <Row label="Véhicule" value={`${t.typeVehicule} · ${t.immatriculation}`} />
      <Row label="Poids en charge" value={formatKg(t.poidsCharge)} />
      <Row label="Poids à vide" value={formatKg(t.poidsVide)} />
      <Row label="Poids net" value={formatKg(t.net)} bold />
      <Row label="Prix/litre" value={isManager ? formatFCFA(t.prixLitre) : '🔒 masqué'} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 14,
  },
  amount: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 16,
    color: colors.text,
  },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
});
