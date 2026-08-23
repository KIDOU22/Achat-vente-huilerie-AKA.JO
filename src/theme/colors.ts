// Thème clair : fond orange-rouge repris du logo Aka.Jo, zones de saisie en blanc.
export const colors = {
  background: '#D4491F', // orange-rouge du logo — fond principal de l'app
  backgroundAlt: '#B23A16', // teinte plus sombre — bandeau de stats, contraste léger
  surface: '#FFFFFF', // cartes + zones de saisie (texte)
  surfaceRaised: '#FFF4EC', // encarts en relief (poids net, montant) sur fond blanc/crème
  border: '#EAD9CB', // bordures sur surfaces blanches
  borderSubtle: 'rgba(255, 255, 255, 0.28)', // séparateurs directement sur le fond orange

  text: '#2A1810', // texte principal — à l'intérieur des surfaces blanches/crème
  textMuted: '#8A6F5C', // texte secondaire — à l'intérieur des surfaces blanches/crème
  textFaint: '#B9A794', // texte discret / placeholder — à l'intérieur des surfaces blanches
  placeholder: '#B9A794',

  // Texte affiché directement sur le fond orange (pas dans une carte/zone de saisie)
  onBackground: '#FFFFFF',
  onBackgroundMuted: 'rgba(255, 255, 255, 0.78)',
  onBackgroundFaint: 'rgba(255, 255, 255, 0.55)',

  accent: '#8C2E10', // rouge brique profond — achats de régimes, boutons, emphase
  amber: '#C97A1E', // tonnage / neutre
  frond: '#5A7350', // succès / payé
  oil: '#B8860B', // ventes d'huile / gérant

  danger: '#8C2E10',
  success: '#5A7350',
  warning: '#C97A1E',
} as const;

export const roleColors = {
  gerant: colors.oil,
  dirigeant: colors.frond,
  agent: colors.amber,
} as const;

export type RoleKey = keyof typeof roleColors;
