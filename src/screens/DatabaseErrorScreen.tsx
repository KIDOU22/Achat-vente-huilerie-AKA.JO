import { AlertTriangle } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui/Button';
import { colors } from '../theme/colors';
import { fonts } from '../theme/typography';

interface Props {
  error: Error;
  resetting: boolean;
  onReset: () => void;
}

// Filet de sécurité pour tout échec au tout premier démarrage (avant que le reste de
// l'app existe) — jusqu'ici un tel échec provoquait un plantage natif systématique à
// chaque ouverture, sans message ni recours autre que la réinstallation complète
// (perte des données locales pas encore synchronisées). Affiche l'erreur réelle et
// permet de repartir d'une base locale vide sans quitter l'app : les données déjà
// envoyées au cloud reviendront à la prochaine synchronisation.
export function DatabaseErrorScreen({ error, resetting, onReset }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]}
    >
      <AlertTriangle size={40} color={colors.onBackground} />
      <Text style={styles.title}>Problème au démarrage</Text>
      <Text style={styles.body}>
        L'application n'a pas pu ouvrir sa base de données locale. Vous pouvez la réinitialiser sans réinstaller
        l'application : les données déjà envoyées sur le cloud reviendront automatiquement à la prochaine
        synchronisation. Seules les opérations saisies ici et jamais synchronisées (pas de réseau au moment de la
        saisie) seraient perdues.
      </Text>

      <View style={styles.errorBox}>
        <Text style={styles.errorLabel}>Détail technique (à transmettre en cas de nouveau blocage) :</Text>
        <Text style={styles.errorText}>{error.message || String(error)}</Text>
      </View>

      <Button label="Réinitialiser la base locale" onPress={onReset} loading={resetting} style={styles.button} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.onBackground,
    textAlign: 'center',
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.onBackgroundMuted,
    textAlign: 'center',
  },
  errorBox: {
    width: '100%',
    backgroundColor: colors.backgroundAlt,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  errorLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.onBackgroundFaint,
  },
  errorText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.onBackgroundMuted,
  },
  button: {
    width: '100%',
  },
});
