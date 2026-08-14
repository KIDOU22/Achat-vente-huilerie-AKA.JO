import { Check } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { AchatTicketCard } from '../components/TicketCard';
import { PartenairePicker } from '../components/PartenairePicker';
import { Button } from '../components/ui/Button';
import { ScaleInput } from '../components/ui/ScaleInput';
import { SectionTitle } from '../components/ui/SectionTitle';
import { TextField } from '../components/ui/TextField';
import { VehiculePicker } from '../components/VehiculePicker';
import { useAppData } from '../data/DataContext';
import { formatFCFA, formatKg } from '../domain/format';
import type { Pesee, VehiculeRegime } from '../domain/types';
import { VEHICULES_REGIME } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

export function AchatScreen() {
  const { isManager } = useAuth();
  const { partenaires, enregistrerPesee, prixKg, setPrixKg, prixTransportRegime, setPrixTransportRegime } = useAppData();
  const fournisseurs = useMemo(() => partenaires.filter((p) => p.type === 'planteur' || p.type === 'pont_independant'), [partenaires]);
  const chauffeurs = useMemo(() => partenaires.filter((p) => p.type === 'chauffeur'), [partenaires]);

  const [selectedPlanteur, setSelectedPlanteur] = useState(fournisseurs[0]?.id ?? '');
  const [numTicketPesee, setNumTicketPesee] = useState('');
  const [selectedChauffeur, setSelectedChauffeur] = useState('');
  const [typeVehicule, setTypeVehicule] = useState<VehiculeRegime>(VEHICULES_REGIME[0]);
  const [immatriculation, setImmatriculation] = useState('');
  const [origine, setOrigine] = useState('');
  const [poidsCharge, setPoidsCharge] = useState('');
  const [poidsVide, setPoidsVide] = useState('');
  const [lastTicket, setLastTicket] = useState<Pesee | null>(null);
  const [saving, setSaving] = useState(false);

  const netAchat = useMemo(() => {
    const c = parseFloat(poidsCharge) || 0;
    const v = parseFloat(poidsVide) || 0;
    return Math.max(0, c - v);
  }, [poidsCharge, poidsVide]);

  const prixNum = parseFloat(prixKg) || 0;
  const prixTransportNum = parseFloat(prixTransportRegime) || 0;
  const montant = Math.round(netAchat * prixNum);
  const montantTransport = Math.round(netAchat * prixTransportNum);

  const canSubmit =
    !!selectedPlanteur && netAchat > 0 && !!selectedChauffeur && !!immatriculation.trim() && !!numTicketPesee.trim();

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const ticket = await enregistrerPesee({
        numTicketPesee,
        planteurId: selectedPlanteur,
        chauffeurId: selectedChauffeur,
        typeVehicule,
        immatriculation,
        origine,
        poidsCharge: parseFloat(poidsCharge),
        poidsVide: parseFloat(poidsVide),
        prixKg: prixNum,
        prixTransportKg: prixTransportNum,
      });
      setLastTicket(ticket);
      setNumTicketPesee('');
      setImmatriculation('');
      setOrigine('');
      setPoidsCharge('');
      setPoidsVide('');
    } finally {
      setSaving(false);
    }
  }

  const planteurById = partenaires.find((p) => p.id === lastTicket?.planteurId);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <SectionTitle>Achat de régimes</SectionTitle>

      <PartenairePicker
        label="Fournisseur (planteur ou pont indépendant)"
        placeholder="Aucun fournisseur — ajoutez-en un dans Partenaires"
        partenaires={fournisseurs}
        selectedId={selectedPlanteur}
        onSelect={setSelectedPlanteur}
      />

      <TextField
        label="N° ticket de pesée (pont-bascule)"
        value={numTicketPesee}
        onChangeText={setNumTicketPesee}
        placeholder="ex: 00284"
        mono
      />

      <TextField
        label="Origine de la graine"
        value={origine}
        onChangeText={setOrigine}
        placeholder="ex: Plantation Grabo Nord"
      />

      <View style={styles.grid2}>
        <View style={{ flex: 1 }}>
          <PartenairePicker
            label="Chauffeur"
            placeholder="Aucun chauffeur — ajoutez-en un dans Partenaires"
            partenaires={chauffeurs}
            selectedId={selectedChauffeur}
            onSelect={setSelectedChauffeur}
            metaLine={(p) => p.tel}
          />
        </View>
        <View style={{ flex: 1 }}>
          <TextField label="Immatriculation" value={immatriculation} onChangeText={setImmatriculation} placeholder="CI-4521-AB" />
        </View>
      </View>

      <VehiculePicker value={typeVehicule} onChange={(v) => setTypeVehicule(v as VehiculeRegime)} options={VEHICULES_REGIME} />

      <View style={styles.grid2}>
        <ScaleInput label="Poids en charge (kg)" value={poidsCharge} onChange={setPoidsCharge} />
        <ScaleInput label="Poids à vide (kg)" value={poidsVide} onChange={setPoidsVide} />
      </View>

      <View style={styles.netBox}>
        <Text style={styles.netLabel}>Poids net (charge − vide)</Text>
        <Text style={styles.netValue}>{formatKg(netAchat)}</Text>
      </View>

      <View style={styles.priceBox}>
        <Text style={styles.netLabel}>Prix du jour de régime (CFA/Kg)</Text>
        {isManager ? (
          <TextInput value={prixKg} onChangeText={setPrixKg} keyboardType="numeric" style={styles.priceInput} />
        ) : (
          <Text style={styles.priceReadOnly}>{formatFCFA(prixNum)}</Text>
        )}
      </View>

      <View style={styles.priceBox}>
        <Text style={styles.netLabel}>Coût du transport de régime (CFA/Kg)</Text>
        {isManager ? (
          <TextInput
            value={prixTransportRegime}
            onChangeText={setPrixTransportRegime}
            keyboardType="numeric"
            style={styles.priceInput}
          />
        ) : (
          <Text style={styles.priceReadOnly}>{formatFCFA(prixTransportNum)}</Text>
        )}
      </View>

      <View style={styles.montantRow}>
        <Text style={styles.netLabel}>Montant régime de palme</Text>
        <Text style={styles.montantValue}>{formatFCFA(montant)}</Text>
      </View>

      <View style={styles.montantRow}>
        <Text style={styles.netLabel}>Coût de transport</Text>
        <Text style={styles.montantValue}>{formatFCFA(montantTransport)}</Text>
      </View>

      <Button label="Enregistrer la pesée" onPress={handleSubmit} disabled={!canSubmit} loading={saving} icon={<Check size={18} color={colors.onBackground} />} />

      {lastTicket && (
        <View style={styles.lastTicket}>
          <Text style={styles.lastTicketLabel}>Dernier ticket</Text>
          <AchatTicketCard t={lastTicket} planteur={planteurById} />
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
    borderColor: `${colors.accent}44`,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  netLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.textMuted, flexShrink: 1, marginRight: 10 },
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
    color: colors.amber,
    textAlign: 'right',
    minWidth: 80,
    paddingVertical: 0,
    flexShrink: 0,
  },
  priceReadOnly: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 16,
    color: colors.amber,
    flexShrink: 0,
  },
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
