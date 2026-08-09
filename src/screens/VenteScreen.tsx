import { Check, Lock } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { VenteTicketCard } from '../components/TicketCard';
import { Button } from '../components/ui/Button';
import { ScaleInput } from '../components/ui/ScaleInput';
import { SectionTitle } from '../components/ui/SectionTitle';
import { TextField } from '../components/ui/TextField';
import { VehiculePicker } from '../components/VehiculePicker';
import { useAppData } from '../data/DataContext';
import { formatFCFA, formatKg } from '../domain/format';
import type { Vente, VehiculeHuile } from '../domain/types';
import { VEHICULES_HUILE } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

export function VenteScreen() {
  const { isManager } = useAuth();
  const { enregistrerVente, prixLitre, setPrixLitre } = useAppData();

  const [client, setClient] = useState('');
  const [numTicketPesee, setNumTicketPesee] = useState('');
  const [chauffeur, setChauffeur] = useState('');
  const [typeVehicule, setTypeVehicule] = useState<VehiculeHuile>(VEHICULES_HUILE[0]);
  const [immatriculation, setImmatriculation] = useState('');
  const [poidsCharge, setPoidsCharge] = useState('');
  const [poidsVide, setPoidsVide] = useState('');
  const [montantTransportInput, setMontantTransportInput] = useState('');
  const [lastVente, setLastVente] = useState<Vente | null>(null);
  const [saving, setSaving] = useState(false);

  const netVente = useMemo(() => {
    const c = parseFloat(poidsCharge) || 0;
    const v = parseFloat(poidsVide) || 0;
    return Math.max(0, c - v);
  }, [poidsCharge, poidsVide]);

  const prixNum = parseFloat(prixLitre) || 0;
  const montant = Math.round(netVente * prixNum);
  const montantTransport = Math.round(parseFloat(montantTransportInput) || 0);
  const montantNet = montant - montantTransport;
  const prixRevient = netVente > 0 ? prixNum - montantTransport / netVente : prixNum;

  const canSubmit =
    !!client.trim() && netVente > 0 && !!chauffeur.trim() && !!immatriculation.trim() && !!numTicketPesee.trim();

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      // Le coût de transport est saisi en montant total ; le tarif au kg est dérivé pour l'enregistrement.
      const prixTransportKg = netVente > 0 ? montantTransport / netVente : 0;
      const ticket = await enregistrerVente({
        numTicketPesee,
        client,
        chauffeur,
        typeVehicule,
        immatriculation,
        poidsCharge: parseFloat(poidsCharge),
        poidsVide: parseFloat(poidsVide),
        prixLitre: prixNum,
        prixTransportKg,
      });
      setLastVente(ticket);
      setClient('');
      setNumTicketPesee('');
      setChauffeur('');
      setImmatriculation('');
      setPoidsCharge('');
      setPoidsVide('');
      setMontantTransportInput('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <SectionTitle color={colors.oil}>Vente d'huile</SectionTitle>

      <TextField label="Client" value={client} onChangeText={setClient} placeholder="Nom du client" />

      <TextField label="N° ticket de pesée (pont-bascule)" value={numTicketPesee} onChangeText={setNumTicketPesee} placeholder="ex: 00284" mono />

      <View style={styles.grid2}>
        <View style={{ flex: 1 }}>
          <TextField label="Chauffeur" value={chauffeur} onChangeText={setChauffeur} placeholder="Nom du chauffeur" />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Immatriculation" value={immatriculation} onChangeText={setImmatriculation} placeholder="CI-4521-AB" />
        </View>
      </View>

      <VehiculePicker
        value={typeVehicule}
        onChange={(v) => setTypeVehicule(v as VehiculeHuile)}
        options={VEHICULES_HUILE}
        color={colors.oil}
      />

      <View style={styles.grid2}>
        <ScaleInput label="Poids en charge (kg)" value={poidsCharge} onChange={setPoidsCharge} color={colors.oil} />
        <ScaleInput label="Poids à vide (kg)" value={poidsVide} onChange={setPoidsVide} color={colors.oil} />
      </View>

      <View style={styles.netBox}>
        <Text style={styles.netLabel}>Poids net (charge − vide)</Text>
        <Text style={styles.netValue}>{formatKg(netVente)}</Text>
      </View>

      <View style={styles.priceBox}>
        <Text style={styles.netLabel}>Prix du litre (F)</Text>
        {isManager ? (
          <TextInput value={prixLitre} onChangeText={setPrixLitre} keyboardType="numeric" style={styles.priceInput} />
        ) : (
          <View style={styles.lockedRow}>
            <Lock size={14} color={colors.textFaint} />
          </View>
        )}
      </View>

      <View style={styles.montantRow}>
        <Text style={styles.netLabel}>Montant vente d'huile</Text>
        {isManager ? (
          <Text style={styles.montantValue}>{formatFCFA(montant)}</Text>
        ) : (
          <View style={styles.lockedRow}>
            <Lock size={14} color={colors.textFaint} />
          </View>
        )}
      </View>

      <View style={styles.priceBox}>
        <Text style={styles.netLabel}>Montant total du transport (F)</Text>
        {isManager ? (
          <TextInput
            value={montantTransportInput}
            onChangeText={setMontantTransportInput}
            keyboardType="numeric"
            placeholder="0"
            style={styles.priceInput}
          />
        ) : (
          <View style={styles.lockedRow}>
            <Lock size={14} color={colors.textFaint} />
          </View>
        )}
      </View>

      {isManager && montantTransport > 0 && (
        <View style={styles.priceBox}>
          <Text style={styles.netLabel}>Prix de revient (CFA/Kg)</Text>
          <Text style={styles.priceReadOnly}>{formatFCFA(prixRevient)}</Text>
        </View>
      )}

      {isManager && montantTransport > 0 && (
        <View style={styles.montantRow}>
          <Text style={styles.netLabel}>Montant net (revient)</Text>
          <Text style={styles.montantValue}>{formatFCFA(montantNet)}</Text>
        </View>
      )}

      <Button
        label="Enregistrer la vente"
        onPress={handleSubmit}
        disabled={!canSubmit}
        loading={saving}
        color={colors.oil}
        icon={<Check size={18} color={colors.onBackground} />}
      />

      {lastVente && (
        <View style={styles.lastTicket}>
          <Text style={styles.lastTicketLabel}>Dernier ticket</Text>
          <VenteTicketCard t={lastVente} isManager={isManager} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, gap: 14, paddingBottom: 60 },
  grid2: { flexDirection: 'row', gap: 12 },
  netBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: `${colors.oil}44`,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  netLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted },
  netValue: { fontFamily: fonts.mono, fontSize: 20, fontWeight: '700', color: colors.text },
  priceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  priceInput: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 16,
    color: colors.oil,
    textAlign: 'right',
    minWidth: 80,
    paddingVertical: 0,
  },
  priceReadOnly: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 16,
    color: colors.oil,
  },
  lockedRow: { flexDirection: 'row', alignItems: 'center' },
  montantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  montantValue: { fontFamily: fonts.monoSemiBold, fontSize: 20, color: colors.text },
  lastTicket: { marginTop: 12 },
  lastTicketLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
    marginBottom: 8,
  },
});
