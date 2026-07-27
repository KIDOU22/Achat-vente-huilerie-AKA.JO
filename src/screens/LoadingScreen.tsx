import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

export function LoadingScreen() {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
