# Tableau de bord web — Huilerie Aka.Jo

Page web autonome (`index.html`), sans build ni installation, pour consulter les
opérations à distance depuis n'importe quel ordinateur.

## Utilisation

1. Ouvrez `index.html` directement dans un navigateur (double-clic, ou glisser-déposer
   dans une fenêtre de navigateur).
2. Connectez-vous avec le même identifiant + code d'accès que dans l'application
   mobile.
3. Les données se mettent à jour automatiquement en temps réel.

> ⚠️ Un compte doit s'être connecté **au moins une fois dans l'application mobile
> avec une connexion internet** avant de pouvoir se connecter ici — c'est cette
> première connexion mobile qui crée le compte côté cloud (voir `src/sync/auth.ts`).

## Sécurité

Les identifiants Supabase intégrés dans `index.html` (URL + clé publique) sont
faits pour être publics — ils ne donnent accès qu'à ce que les règles de sécurité
(RLS, voir `supabase/migrations/0001_init.sql`) autorisent pour l'utilisateur
connecté. Un agent connecté ici ne recevra jamais les prix/montants de vente,
exactement comme dans l'application mobile.

## Héberger cette page en ligne (optionnel)

Pour obtenir un lien partageable plutôt que d'ouvrir le fichier localement,
déposez ce dossier sur un hébergeur statique gratuit (Netlify, Vercel, GitHub
Pages...). Aucune configuration de build n'est nécessaire, c'est un fichier HTML
autonome.
