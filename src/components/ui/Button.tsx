import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { fonts } from '../../theme/typography';

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
  variant?: 'solid' | 'outline';
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({ label, onPress, disabled, loading, color = colors.accent, variant = 'solid', icon, style }: ButtonProps) {
  const isDisabled = disabled || loading;
  const solid = variant === 'solid';
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.base,
        solid ? { backgroundColor: color } : { backgroundColor: 'transparent', borderWidth: 1, borderColor: color },
        isDisabled && { opacity: 0.4 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={solid ? colors.onBackground : color} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, { color: solid ? colors.onBackground : color }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontFamily: fonts.bodySemiBold,
    fontSize: 16,
  },
});
