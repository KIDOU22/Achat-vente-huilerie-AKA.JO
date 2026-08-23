import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';

export function SectionTitle({ children, color = colors.accent }: { children: React.ReactNode; color?: string }) {
  return (
    <Text style={[styles.title, { color }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    marginBottom: 4,
  },
});
