import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../../theme/typography';
import { ROLE_LABELS, type Role } from '../../domain/types';
import { roleColors } from '../../theme/colors';

export function RoleBadge({ role }: { role: Role }) {
  const color = roleColors[role];
  return (
    <View style={[styles.badge, { backgroundColor: `${color}33` }]}>
      <Text style={[styles.text, { color }]}>{ROLE_LABELS[role]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  text: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
