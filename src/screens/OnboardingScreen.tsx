import React, { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/TextField';
import type { User } from '../domain/types';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

const logo = require('../../assets/images/logo-akajo.png');

// Affiché à la première connexion (identifiant/code provisoires attribués par le
// Gérant) ou après une réinitialisation d'accès : l'utilisateur choisit un
// identifiant et un code d'accès personnels, connus de lui seul.
export function OnboardingScreen({ user }: { user: User }) {
  const { completeOnboarding, cancelOnboarding } = useAuth();
  const [identifiant, setIdentifiant] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!identifiant.trim() || !code.trim()) {
      setError("Identifiant et code d'accès requis.");
      return;
    }
    if (code.trim() !== confirmation.trim()) {
      setError('Les deux codes ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    const result = await completeOnboarding(identifiant, code);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? 'Erreur inattendue.');
      return;
    }
    setError('');
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <View style={styles.logoWrap}>
          <Image source={logo} style={styles.logo} />
        </View>
        <Text style={styles.eyebrow}>Bienvenue {user.nom}</Text>
        <Text style={styles.title}>Créez vos accès personnels</Text>
        <Text style={styles.hint}>
          Choisissez un identifiant et un code d'accès que vous garderez secrets. L'identifiant provisoire donné par
          le Gérant ne fonctionnera plus ensuite.
        </Text>

        <View style={styles.form}>
          <TextField
            label="Nouvel identifiant"
            value={identifiant}
            onChangeText={setIdentifiant}
            placeholder="ex: rolandk"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextField
            label="Nouveau code d'accès"
            value={code}
            onChangeText={setCode}
            placeholder="••••"
            secureTextEntry
            keyboardType="number-pad"
            style={{ letterSpacing: 4 }}
          />
          <TextField
            label="Confirmer le code d'accès"
            value={confirmation}
            onChangeText={setConfirmation}
            placeholder="••••"
            secureTextEntry
            keyboardType="number-pad"
            style={{ letterSpacing: 4 }}
            onSubmitEditing={handleSubmit}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Button label="Continuer" onPress={handleSubmit} loading={submitting} style={styles.submit} />
          <Button label="Annuler et revenir" onPress={cancelOnboarding} variant="outline" color={colors.onBackgroundMuted} />
        </View>
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: 16,
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
    fontSize: 22,
    color: colors.onBackground,
    marginBottom: 10,
    textAlign: 'center',
  },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.onBackgroundMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 17,
  },
  form: { width: '100%', maxWidth: 340, gap: 14 },
  error: { color: colors.onBackground, fontFamily: fonts.bodySemiBold, fontSize: 14 },
  submit: { marginTop: 4 },
});
