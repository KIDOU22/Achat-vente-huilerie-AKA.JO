import React from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';

interface TextFieldProps extends TextInputProps {
  label: string;
  mono?: boolean;
}

export function TextField({ label, mono, style, ...props }: TextFieldProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.placeholder}
        style={[styles.input, mono && { fontFamily: fonts.mono }, style]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 0 },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
    fontFamily: fonts.body,
  },
});
