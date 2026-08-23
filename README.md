# Huilerie Aka.Jo — Achats de régimes & Vente d'huile

Application mobile (iOS + Android, Expo/React Native) pour digitaliser la gestion au pont-bascule de l'huilerie : achats de régimes de palme auprès des planteurs, ventes d'huile en sortie, et synthèse financière — avec contrôle d'accès par niveau de responsabilité.

Construite à partir du prototype de référence `pesee-regimes.jsx` (React web, en mémoire) : UI, palette et logique métier ont été reprises fidèlement, avec base de données locale persistante et authentification réelle.

## Stack

- **Expo (React Native)** + [expo-router](https://docs.expo.dev/router/introduction/) (navigation par fichiers, iOS/Android depuis un seul code)
- **SQLite local** via `expo-sqlite` — persistance et fonctionnement hors-ligne dès le premier lancement
- **Authentification** : table `users` avec code d'accès hashé en **bcrypt** (`bcryptjs`), jamais stocké en clair
- **Polices** : Fraunces (titres), IBM Plex Sans (corps), IBM Plex Mono (chiffres/tickets) — identiques au prototype
- **Icônes** : `lucide-react-native`

## Démarrer

```bash
npm install
npm run start      # puis 'a' pour Android, 'i' pour iOS (macOS), 'w' pour le web
```

Comptes de démonstration créés automatiquement au premier lancement :

| Rôle  | Identifiant | Code |
|-------|-------------|------|
| Gérant | `gerant` | `1234` |
| Agent pont-bascule | `bascule1` | `0000` |

## Créer un installable (APK / IPA) pour plusieurs téléphones

Pour distribuer l'app sans passer par Expo Go, on génère un vrai binaire installable avec [EAS Build](https://docs.expo.dev/build/introduction/) (service Expo, gratuit pour ce volume). Le fichier produit (APK pour Android, IPA pour iOS) peut ensuite être installé sur plusieurs téléphones.

1. **Créer un compte Expo** (gratuit) sur [expo.dev](https://expo.dev/signup)
2. Installer la CLI et se connecter :
   ```bash
   npm install -g eas-cli
   eas login
   ```
3. Lier le projet à votre compte (une seule fois — ajoute automatiquement un `projectId` dans `app.json`) :
   ```bash
   eas init
   ```
4. **Android** — génère un `.apk` installable directement sur n'importe quel téléphone (activer « sources inconnues » dans les réglages Android) :
   ```bash
   npm run build:android
   ```
5. **iOS** — nécessite en plus un compte [Apple Developer Program](https://developer.apple.com/programs/) payant (99 $/an). EAS gère les certificats automatiquement ; il faudra enregistrer l'UDID de chaque iPhone destinataire (EAS génère un lien d'enregistrement à envoyer à chaque utilisateur) :
   ```bash
   npm run build:ios
   ```

Chaque build donne un lien de téléchargement (et un QR code) partageable avec toute l'équipe. Les profils `preview` (build interne, celui utilisé ci-dessus) et `production` (destiné au Play Store / App Store) sont définis dans `eas.json`.

> **Important — comptes par appareil, pas encore synchronisés.** La base de données (planteurs, pesées, ventes, **comptes utilisateurs**) est actuellement **locale à chaque téléphone** (SQLite embarqué, voir « Mode hors-ligne » ci-dessous). Un compte Agent créé par le Gérant sur son téléphone n'existe donc **pas automatiquement** sur le téléphone de l'agent : il faut soit que le Gérant crée chaque compte directement sur l'appareil de l'agent (écran *Comptes*, après avoir installé l'app), soit — pour un vrai multi-appareil avec une base partagée — mettre en place la synchronisation Supabase listée en roadmap ci-dessous. Dites-moi si vous voulez que je la mette en place maintenant : il faut un projet Supabase (gratuit) dont vous me donnez l'URL et la clé.

## Structure du projet

```
app/                      Routes expo-router (fichiers = écrans)
  _layout.tsx              Racine : polices, SQLite, auth, garde d'accès (Stack.Protected)
  login.tsx
  comptes.tsx               Gestion des comptes (gérant uniquement)
  (tabs)/_layout.tsx        Barre d'onglets (Achat, Vente, Synthèse, Planteurs, Historique)
  (tabs)/*.tsx

src/
  auth/                    Contexte d'authentification + hashage bcrypt des codes
  data/                    Contexte de données partagé (planteurs, pesées, ventes, prix)
  db/
    schema.ts               Schéma SQLite + migrations + seed initial
    repositories/            Accès aux données (users, planteurs, pesées, ventes, settings, audit)
  domain/                  Types métier + helpers de formatage / périodes
  screens/                 Écrans (un composant par onglet + login/comptes)
  components/              Composants réutilisables (header, tickets, graphique, sélecteurs)
  theme/                   Couleurs, typographies, chargement des polices
```

## Fonctionnalités livrées

- **Authentification & rôles** : connexion identifiant + code, deux rôles (Gérant / Agent pont-bascule), session persistée (`expo-secure-store`)
- **Achat de régimes** : planteur (sélecteur + recherche), n° ticket, origine, chauffeur, véhicule, poids charge/vide → net calculé, prix du jour, montant, statut payé/impayé
- **Vente d'huile** : mêmes principes avec client au lieu de planteur ; prix et montant **masqués** pour tout rôle autre que Gérant
- **Planteurs** : CRUD (nom, village, téléphone), recherche, cumul de tonnage livré par planteur
- **Historique** : liste chronologique achats + ventes, bascule payé/impayé, montants de vente masqués pour les agents
- **Synthèse (Gérant uniquement)** : filtrage jour/semaine/mois/année, graphique en barres achats vs ventes (poids/montant), totaux et solde
- **Comptes utilisateurs (Gérant uniquement)** : création de compte, changement de rôle, révocation d'accès — un identifiant + code d'accès par agent (voir la note sur le multi-appareil ci-dessous)
- **Journal d'audit** : chaque création de pesée/vente, changement de statut payé, création de compte, changement de rôle et révocation est tracé (qui, quoi, quand) dans `audit_log` — utile en cas de litige
- **Mode hors-ligne** : la base SQLite locale est la source de vérité ; toutes les fonctionnalités ci-dessus fonctionnent sans réseau dès l'installation

## Roadmap production (non inclus dans cette itération)

Ces compléments demandent des décisions externes (compte Supabase, matériel d'impression) ou un cycle de test sur appareil réel — ils n'ont pas été codés en dur pour éviter du code mort :

- **Synchronisation multi-appareils (Supabase)** : Postgres + Auth + Realtime, sync différée quand la connexion revient — nécessaire pour que les comptes utilisateurs et les données (achats/ventes/planteurs) soient partagés entre plusieurs téléphones plutôt que locaux à chacun. Nécessite un projet Supabase (URL + clé) fourni par vous ; le repo local (`src/db/repositories`) est déjà isolé de l'UI, ce qui permet d'ajouter une couche de sync sans toucher aux écrans.
- **Export des rapports** (PDF/Excel) pour la comptabilité
- **Impression de tickets** via imprimante Bluetooth portable au pont-bascule
- **Sauvegarde/restauration** de la base locale (fichier SQLite exportable)
- **Tests sur appareil réel** iOS/Android avec les builds EAS (voir section ci-dessus)

## Vérifications effectuées

- `npm run typecheck` (`tsc --noEmit`) — aucune erreur
- `expo export --platform android` — bundle Metro généré avec succès (3199 modules)
