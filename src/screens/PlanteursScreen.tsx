import { Plus, Search, Trash2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SectionTitle } from '../components/ui/SectionTitle';
import { TextField } from '../components/ui/TextField';
import { useAppData } from '../data/DataContext';
import { formatTonnes } from '../domain/format';
import type { Planteur } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

export function PlanteursScreen() {
  const { isManager } = useAuth();
  const { planteurs, tonnageParPlanteur, addPlanteur, supprimerPlanteur } = useAppData();

  const [search, setSearch] = useState('');
  const [nom, setNom] = useState('');
  const [village, setVillage] = useState('');
  const [tel, setTel] = useState('');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () => planteurs.filter((p) => p.nom.toLowerCase().includes(search.toLowerCase())),
    [planteurs, search]
  );

  async function handleAdd() {
    if (!nom.trim()) return;
    setSaving(true);
    try {
      await addPlanteur({ nom, village, tel });
      setNom('');
      setVillage('');
      setTel('');
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(planteur: Planteur) {
    Alert.alert('Supprimer ce planteur ?', `${planteur.nom} sera définitivement retiré de la liste.`, [
      { text: 'Retour', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await supprimerPlanteur(planteur.id);
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
          <SectionTitle color={colors.frond}>Planteurs</SectionTitle>

          <Card style={{ gap: 10 }}>
            <Text style={styles.cardTitle}>Ajouter un planteur</Text>
            <TextField label="Nom" value={nom} onChangeText={setNom} placeholder="Nom complet" />
            <View style={styles.grid2}>
              <View style={{ flex: 1 }}>
                <TextField label="Village / zone" value={village} onChangeText={setVillage} placeholder="ex: Grabo Centre" />
              </View>
              <View style={{ flex: 1 }}>
                <TextField label="Téléphone" value={tel} onChangeText={setTel} placeholder="07 00 00 00" keyboardType="phone-pad" />
              </View>
            </View>
            <Button label="Ajouter" onPress={handleAdd} disabled={!nom.trim()} loading={saving} color={colors.frond} icon={<Plus size={18} color={colors.onBackground} />} />
          </Card>

          <View style={styles.searchRow}>
            <Search size={16} color={colors.textFaint} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Rechercher un planteur"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
            />
          </View>
        </View>
      }
      renderItem={({ item }) => {
        const tonnage = tonnageParPlanteur[item.id];
        return (
          <Card style={styles.planteurCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.planteurName}>{item.nom}</Text>
              <Text style={styles.planteurMeta}>{item.village} · {item.tel}</Text>
            </View>
            <View style={styles.tonnageBlock}>
              <Text style={styles.tonnageValue}>{formatTonnes(tonnage?.totalNet ?? 0)}</Text>
              <Text style={styles.tonnageLabel}>{tonnage?.livraisons ?? 0} livraison{(tonnage?.livraisons ?? 0) > 1 ? 's' : ''}</Text>
            </View>
            {isManager && (
              <Pressable onPress={() => handleDelete(item)} hitSlop={10} style={styles.deleteBtn}>
                <Trash2 size={16} color={colors.accent} />
              </Pressable>
            )}
          </Card>
        );
      }}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={<Text style={styles.empty}>Aucun planteur trouvé</Text>}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 20, paddingBottom: 60 },
  cardTitle: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.text },
  grid2: { flexDirection: 'row', gap: 12 },
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
  planteurCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planteurName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.text },
  planteurMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  tonnageBlock: { alignItems: 'flex-end' },
  deleteBtn: { marginLeft: 10, padding: 4 },
  tonnageValue: { fontFamily: fonts.monoSemiBold, fontSize: 15, color: colors.amber },
  tonnageLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.textFaint, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.onBackgroundMuted, fontFamily: fonts.body, paddingVertical: 24 },
});
