// Palette reprise du prototype pesee-regimes.jsx (thème sombre, huilerie).
export const colors = {
  background: '#1C1A17',
  backgroundAlt: '#211E19',
  surface: '#26221D',
  surfaceRaised: '#0F0E0C',
  border: '#3a352d',
  borderSubtle: 'rgba(120, 113, 100, 0.25)',

  text: '#F2EDE4',
  textMuted: '#8C8479',
  textFaint: '#6b6459',
  placeholder: '#6b6459',

  accent: '#D4491F', // achats de régimes
  amber: '#C97A1E', // tonnage / neutre
  frond: '#5A7350', // succès / payé
  oil: '#B8860B', // ventes d'huile / gérant

  danger: '#D4491F',
  success: '#5A7350',
  warning: '#C97A1E',
} as const;

export const roleColors = {
  gerant: colors.oil,
  agent: colors.amber,
} as const;

export type RoleKey = keyof typeof roleColors;
