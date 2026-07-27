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
- **Comptes utilisateurs (Gérant uniquement)** : création de compte, changement de rôle, révocation d'accès
- **Journal d'audit** : chaque création de pesée/vente, changement de statut payé, création de compte, changement de rôle et révocation est tracé (qui, quoi, quand) dans `audit_log` — utile en cas de litige
- **Mode hors-ligne** : la base SQLite locale est la source de vérité ; toutes les fonctionnalités ci-dessus fonctionnent sans réseau dès l'installation

## Roadmap production (non inclus dans cette itération)

Ces compléments demandent des décisions externes (compte Supabase, matériel d'impression) ou un cycle de test sur appareil réel — ils n'ont pas été codés en dur pour éviter du code mort :

- **Synchronisation multi-appareils (Supabase)** : Postgres + Auth + Realtime, sync différée quand la connexion revient. Nécessite un projet Supabase (URL + clé) fourni par vous ; le repo local (`src/db/repositories`) est déjà isolé de l'UI, ce qui permet d'ajouter une couche de sync sans toucher aux écrans.
- **Export des rapports** (PDF/Excel) pour la comptabilité
- **Impression de tickets** via imprimante Bluetooth portable au pont-bascule
- **Sauvegarde/restauration** de la base locale (fichier SQLite exportable)
- **Tests sur appareil réel** iOS/Android (build avec EAS ou `expo run:android` / `expo run:ios`)

## Vérifications effectuées

- `npm run typecheck` (`tsc --noEmit`) — aucune erreur
- `expo export --platform android` — bundle Metro généré avec succès (3199 modules)
