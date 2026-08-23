// Convertit app.json en config dynamique : permet de produire une version "démo"
// (icône, nom et identifiant d'app différents) installable à côté de la vraie
// application sur le même téléphone, sans jamais l'écraser — utile pour tester des
// améliorations pendant que les opérations réelles continuent sur l'app de
// production. Choisie via la variable d'environnement APP_VARIANT (voir le profil
// "demo" dans eas.json), absente par défaut (= build normal, production).
const isDemo = process.env.APP_VARIANT === 'demo';

module.exports = {
  expo: {
    name: isDemo ? 'Huilerie Aka.Jo (Démo)' : 'Huilerie Aka.Jo',
    slug: 'huilerie-akajo',
    scheme: isDemo ? 'huilerie-akajo-demo' : 'huilerie-akajo',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/logo-akajo.png',
    userInterfaceStyle: 'dark',
    newArchEnabled: true,
    plugins: ['expo-router', 'expo-sqlite', 'expo-secure-store'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: isDemo ? 'com.akajo.huilerie.demo' : 'com.akajo.huilerie',
    },
    android: {
      package: isDemo ? 'com.akajo.huilerie.demo' : 'com.akajo.huilerie',
      adaptiveIcon: {
        backgroundColor: isDemo ? '#1D4ECF' : '#1C1A17',
        foregroundImage: './assets/images/logo-akajo.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: './assets/images/logo-akajo.png',
      bundler: 'metro',
    },
    extra: {
      eas: {
        projectId: 'dd9b8e4e-c78a-4ac9-a867-da41bb548698',
      },
    },
  },
};
