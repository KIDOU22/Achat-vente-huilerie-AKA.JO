import React, { useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

const logo = require('../../assets/images/logo-akajo.png');

export function LoginScreen() {
  const { login } = useAuth();
  const [identifiant, setIdentifiant] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    const result = await login(identifiant, code);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? 'Erreur de connexion');
      return;
    }
    setError('');
    setIdentifiant('');
    setCode('');
    if (result.syncError) {
      Alert.alert('Synchro cloud indisponible', result.syncError);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <View style={styles.logoWrap}>
          <Image source={logo} style={styles.logo} />
        </View>
        <Text style={styles.eyebrow}>Huilerie Aka.Jo</Text>
        <Text style={styles.title}>Connexion</Text>

        <View style={styles.form}>
          <TextField
            label="Identifiant"
            value={identifiant}
            onChangeText={setIdentifiant}
            placeholder="ex: gerant"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Code d'accès"
            value={code}
            onChangeText={setCode}
            placeholder="••••"
            secureTextEntry
            keyboardType="number-pad"
            style={{ letterSpacing: 4 }}
            onSubmitEditing={handleSubmit}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Button label="Se connecter" onPress={handleSubmit} loading={submitting} style={styles.submit} />
        </View>

        <Text style={styles.hint}>
          Démo — Gérant : <Text style={styles.hintMono}>gerant / 1234</Text> · Agent :{' '}
          <Text style={styles.hintMono}>bascule1 / 0000</Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: 20,
  },
  logo: { width: '100%', height: '100%' },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.onBackgroundMuted,
    marginBottom: 4,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    color: colors.onBackground,
    marginBottom: 28,
  },
  form: { width: '100%', maxWidth: 340, gap: 14 },
  error: { color: colors.onBackground, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  submit: { marginTop: 4 },
  hint: {
    marginTop: 32,
    textAlign: 'center',
    maxWidth: 320,
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.onBackgroundMuted,
  },
  hintMono: { fontFamily: fonts.mono },
});
