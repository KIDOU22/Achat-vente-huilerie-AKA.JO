import { Lock } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';

export function LockedValue({ size = 16 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <Lock size={size} color={colors.textFaint} />
    </View>
  );
}

export function LockedLabel() {
  return <Text style={styles.text}>masqué</Text>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { fontFamily: fonts.body, color: colors.textFaint, fontSize: 13 },
});
