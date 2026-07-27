// Polices reprises du prototype : Fraunces (titres), IBM Plex Sans (corps), IBM Plex Mono (chiffres/tickets).
export const fonts = {
  heading: 'Fraunces_600SemiBold',
  headingBold: 'Fraunces_700Bold',
  body: 'IBMPlexSans_400Regular',
  bodyMedium: 'IBMPlexSans_500Medium',
  bodySemiBold: 'IBMPlexSans_600SemiBold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
  monoBold: 'IBMPlexMono_700Bold',
} as const;

export const fieldLabelStyle = {
  fontFamily: fonts.mono,
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: 'uppercase' as const,
};
