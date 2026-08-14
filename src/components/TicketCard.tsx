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
      {t.montantTransport > 0 && <Row label="Coût transport" value={formatFCFA(t.montantTransport)} />}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <View style={[styles.statusPill, { marginTop: 0, backgroundColor: t.payeRegime ? `${colors.frond}33` : `${colors.accent}33` }]}>
          <Text style={{ color: t.payeRegime ? colors.frond : colors.accent, fontFamily: fonts.bodyMedium, fontSize: 12 }}>
            Régime {t.payeRegime ? 'payé' : 'impayé'}
          </Text>
        </View>
        {t.montantTransport > 0 && (
          <View style={[styles.statusPill, { marginTop: 0, backgroundColor: t.payeTransport ? `${colors.frond}33` : `${colors.accent}33` }]}>
            <Text style={{ color: t.payeTransport ? colors.frond : colors.accent, fontFamily: fonts.bodyMedium, fontSize: 12 }}>
              Transport {t.payeTransport ? 'payé' : 'impayé'}
            </Text>
          </View>
        )}
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
      {t.montantTransport > 0 && (
        <>
          <Row label="Coût transport" value={isManager ? formatFCFA(t.montantTransport) : '🔒 masqué'} />
          <Row
            label="Prix de revient/kg"
            value={isManager ? formatFCFA(t.prixLitre - t.prixTransportKg) : '🔒 masqué'}
          />
          <Row label="Montant net" value={isManager ? formatFCFA(t.montant - t.montantTransport) : '🔒 masqué'} bold />
        </>
      )}
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
