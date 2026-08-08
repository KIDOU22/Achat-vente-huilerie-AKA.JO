import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';
import { VEHICULES } from '../domain/types';

export function VehiculePicker({ value, onChange, color = colors.accent }: { value: string; onChange: (v: string) => void; color?: string }) {
  return (
    <View>
      <Text style={styles.label}>Type de véhicule</Text>
      <View style={styles.grid}>
        {VEHICULES.map((v) => {
          const active = v === value;
          return (
            <Pressable
              key={v}
              onPress={() => onChange(v)}
              style={[styles.chip, active ? { backgroundColor: color } : styles.chipInactive]}
            >
              <Text style={[styles.chipText, { color: active ? colors.onBackground : colors.textMuted }]} numberOfLines={2}>
                {v}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexBasis: '23%',
    flexGrow: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipInactive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    textAlign: 'center',
  },
});
