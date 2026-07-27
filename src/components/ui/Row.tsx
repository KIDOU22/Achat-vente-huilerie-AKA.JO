import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';

export function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, bold && styles.bold]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  value: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: colors.text,
  },
  bold: {
    fontFamily: fonts.monoSemiBold,
  },
});
