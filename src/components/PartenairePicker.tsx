import { ChevronDown, Search, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Partenaire } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

interface PartenairePickerProps {
  label: string;
  placeholder: string;
  partenaires: Partenaire[];
  selectedId: string;
  onSelect: (id: string) => void;
  metaLine?: (p: Partenaire) => string;
}

export function PartenairePicker({ label, placeholder, partenaires, selectedId, onSelect, metaLine }: PartenairePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = partenaires.find((p) => p.id === selectedId);
  const filtered = useMemo(
    () => partenaires.filter((p) => p.nom.toLowerCase().includes(search.toLowerCase())),
    [partenaires, search]
  );
  const meta = metaLine ?? ((p: Partenaire) => p.village);

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.triggerText} numberOfLines={1}>
          {partenaires.length === 0 ? placeholder : selected ? `${selected.nom} — ${meta(selected)}` : placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.searchRow}>
              <Search size={16} color={colors.textFaint} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Rechercher"
                placeholderTextColor={colors.placeholder}
                style={styles.searchInput}
                autoFocus
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.item}
                  onPress={() => {
                    onSelect(item.id);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <Text style={styles.itemName}>{item.nom}</Text>
                  <Text style={styles.itemMeta}>{meta(item)}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>Aucun résultat</Text>}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
    marginBottom: 6,
  },
  trigger: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  triggerText: { fontFamily: fonts.body, fontSize: 16, color: colors.text, flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 11, color: colors.text, fontFamily: fonts.body, fontSize: 15 },
  item: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  itemName: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  itemMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textFaint, fontFamily: fonts.body, paddingVertical: 24 },
});
