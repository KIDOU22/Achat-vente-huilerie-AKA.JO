import { useRouter } from 'expo-router';
import { Plus, Search, Trash2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SectionTitle } from '../components/ui/SectionTitle';
import { TextField } from '../components/ui/TextField';
import { useAppData } from '../data/DataContext';
import { statsPartenaire } from '../domain/partenaires';
import { formatFCFA, formatTonnes } from '../domain/format';
import { PARTENAIRE_TYPE_LABELS, type Partenaire, type PartenaireType } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

const FILTRES: { key: PartenaireType | 'tous'; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'planteur', label: 'Planteurs' },
  { key: 'pont_independant', label: 'Ponts indépendants' },
  { key: 'chauffeur', label: 'Chauffeurs' },
];

export function PartenairesScreen() {
  const router = useRouter();
  const { isManager } = useAuth();
  const { partenaires, pesees, ventes, mouvements, addPartenaire, supprimerPartenaire } = useAppData();

  const [search, setSearch] = useState('');
  const [filtre, setFiltre] = useState<PartenaireType | 'tous'>('tous');
  const [type, setType] = useState<PartenaireType>('planteur');
  const [nom, setNom] = useState('');
  const [village, setVillage] = useState('');
  const [tel, setTel] = useState('');
  const [localisation, setLocalisation] = useState('');
  const [responsable, setResponsable] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () =>
      partenaires
        .filter((p) => filtre === 'tous' || p.type === filtre)
        .filter((p) => p.nom.toLowerCase().includes(search.toLowerCase())),
    [partenaires, filtre, search]
  );

  async function handleAdd() {
    if (!nom.trim()) return;
    setSaving(true);
    try {
      await addPartenaire({ type, nom, village, tel, localisation, responsable });
      setNom('');
      setVillage('');
      setTel('');
      setLocalisation('');
      setResponsable('');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(partenaire: Partenaire) {
    Alert.alert(`Supprimer ce ${PARTENAIRE_TYPE_LABELS[partenaire.type].toLowerCase()} ?`, `${partenaire.nom} sera définitivement retiré de la liste.`, [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerPartenaire(partenaire.id);
          } catch (err) {
            Alert.alert('Suppression impossible', err instanceof Error ? err.message : String(err));
          }
        },
      },
    ]);
  }

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      style={styles.screen}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={{ gap: 14, marginBottom: 18 }}>
          <SectionTitle color={colors.frond}>Partenaires</SectionTitle>

          <Card style={{ gap: 10 }}>
            <Text style={styles.cardTitle}>Ajouter un partenaire</Text>
            <View style={styles.grid3}>
              {(['planteur', 'pont_independant', 'chauffeur'] as PartenaireType[]).map((t) => {
                const active = type === t;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setType(t)}
                    style={[styles.typeChip, active ? { backgroundColor: colors.frond } : styles.typeChipInactive]}
                  >
                    <Text style={[styles.typeChipText, { color: active ? colors.onBackground : colors.textMuted }]}>
                      {PARTENAIRE_TYPE_LABELS[t]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextField label={type === 'pont_independant' ? 'Nom du pont' : 'Nom'} value={nom} onChangeText={setNom} placeholder="Nom complet" />

            {type === 'planteur' && (
              <View style={styles.grid2}>
                <View style={{ flex: 1 }}>
                  <TextField label="Village / zone" value={village} onChangeText={setVillage} placeholder="ex: Grabo Centre" />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField label="Téléphone" value={tel} onChangeText={setTel} placeholder="07 00 00 00" keyboardType="phone-pad" />
                </View>
              </View>
            )}

            {type === 'chauffeur' && (
              <TextField label="Téléphone" value={tel} onChangeText={setTel} placeholder="07 00 00 00" keyboardType="phone-pad" />
            )}

            {type === 'pont_independant' && (
              <>
                <TextField label="Localisation" value={localisation} onChangeText={setLocalisation} placeholder="ex: Route de Tabou" />
                <View style={styles.grid2}>
                  <View style={{ flex: 1 }}>
                    <TextField label="Responsable / contact" value={responsable} onChangeText={setResponsable} placeholder="Nom du responsable" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField label="Téléphone" value={tel} onChangeText={setTel} placeholder="07 00 00 00" keyboardType="phone-pad" />
                  </View>
                </View>
              </>
            )}

            <Button label="Ajouter" onPress={handleAdd} disabled={!nom.trim()} loading={saving} color={colors.frond} icon={<Plus size={18} color={colors.onBackground} />} />
          </Card>

          <View style={styles.filtresRow}>
            {FILTRES.map((f) => {
              const active = f.key === filtre;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFiltre(f.key)}
                  style={[styles.filtreChip, active ? { backgroundColor: colors.text } : styles.filtreChipInactive]}
                >
                  <Text style={[styles.filtreChipText, { color: active ? colors.onBackground : colors.textMuted }]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.searchRow}>
            <Search size={16} color={colors.textFaint} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un partenaire"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
            />
          </View>
        </View>
      }
      renderItem={({ item }) => {
        const stats = statsPartenaire(item, pesees, ventes, mouvements);
        const meta =
          item.type === 'pont_independant'
            ? `${item.localisation} · ${item.responsable} · ${item.tel}`
            : item.type === 'chauffeur'
              ? item.tel
              : `${item.village} · ${item.tel}`;
        return (
          <Pressable onPress={() => router.push(`/partenaire/${item.id}`)}>
            <Card style={styles.partenaireCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.partenaireName}>{item.nom}</Text>
                <Text style={styles.partenaireMeta}>{meta}</Text>
              </View>
              <View style={styles.tonnageBlock}>
                <Text style={styles.tonnageValue}>{formatTonnes(stats.tonnage)}</Text>
                <Text style={[styles.soldeText, { color: stats.solde > 0 ? colors.accent : colors.frond }]}>
                  {stats.solde > 0 ? `${formatFCFA(stats.solde)} impayé` : stats.solde < 0 ? `${formatFCFA(-stats.solde)} créance` : 'Soldé'}
                </Text>
              </View>
              {isManager && (
                <Pressable onPress={() => handleDelete(item)} hitSlop={10} style={styles.deleteBtn}>
                  <Trash2 size={16} color={colors.accent} />
                </Pressable>
              )}
            </Card>
          </Pressable>
        );
      }}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={<Text style={styles.empty}>Aucun partenaire trouvé</Text>}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 60 },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  grid2: { flexDirection: 'row', gap: 12 },
  grid3: { flexDirection: 'row', gap: 8 },
  typeChip: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  typeChipInactive: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  typeChipText: { fontFamily: fonts.bodyMedium, fontSize: 11, textAlign: 'center' },
  filtresRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filtreChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  filtreChipInactive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  filtreChipText: { fontFamily: fonts.bodyMedium, fontSize: 11 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 11, color: colors.text, fontFamily: fonts.body, fontSize: 15 },
  partenaireCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  partenaireName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.text },
  partenaireMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tonnageBlock: { alignItems: 'flex-end' },
  deleteBtn: { marginLeft: 10, padding: 4 },
  tonnageValue: { fontFamily: fonts.monoSemiBold, fontSize: 15, color: colors.amber },
  soldeText: { fontFamily: fonts.body, fontSize: 11, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.onBackgroundMuted, fontFamily: fonts.body, paddingVertical: 24 },
});
