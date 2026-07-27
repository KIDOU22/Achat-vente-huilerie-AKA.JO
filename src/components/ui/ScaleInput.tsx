import React from 'react';
import { View } from 'react-native';
import { colors } from '../../theme/colors';
import { TextField } from './TextField';

interface ScaleInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  color?: string;
}

export function ScaleInput({ label, value, onChange, color = colors.accent }: ScaleInputProps) {
  return (
    <View style={{ flex: 1 }}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder="0"
        mono
        style={{ color, fontSize: 18 }}
      />
    </View>
  );
}
