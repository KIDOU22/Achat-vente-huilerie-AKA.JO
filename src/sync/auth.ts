import { supabase } from '../lib/supabase';
import type { Role } from '../domain/types';

// Ponte l'authentification locale (identifiant + code à 4 chiffres) vers Supabase Auth,
// qui exige un email + un mot de passe. L'utilisateur ne voit ni ne saisit jamais ces
// valeurs dérivées — seul son code à 4 chiffres compte côté UI.
//
// Important : l'identifiant "profiles.id" est TOUJOURS l'UID Supabase Auth de la
// session (jamais l'id local SQLite de l'utilisateur, qui vit dans un espace
// d'identifiants totalement différent).
function deriveEmail(identifiant: string): string {
  return `${identifiant.trim().toLowerCase()}@akajo-sync.com`;
}

function derivePassword(identifiant: string, code: string): string {
  return `akajo-${identifiant.trim().toLowerCase()}-${code.trim()}-sync`;
}

interface SyncSignInInput {
  identifiant: string;
  code: string;
  nom: string;
  role: Role;
}

export interface SyncSignInResult {
  ok: boolean;
  error?: string;
}

// Best-effort : connecte (ou crée si première fois) la session cloud correspondant à
// l'utilisateur qui vient de se connecter localement avec succès. N'échoue jamais
// bruyamment sur la connexion locale — l'app reste utilisable hors-ligne si Supabase
// n'est pas joignable — mais renvoie un message d'erreur exploitable pour diagnostic.
export async function syncSignIn({ identifiant, code, nom, role }: SyncSignInInput): Promise<SyncSignInResult> {
  if (!supabase) return { ok: false, error: 'Supabase non configuré (variables .env absentes du build).' };

  const email = deriveEmail(identifiant);
  const password = derivePassword(identifiant, code);

  try {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (!signInError && signInData.user) {
      const profileError = await upsertOwnProfile(signInData.user.id, identifiant, nom, role);
      if (profileError) return { ok: false, error: `Profil non enregistré : ${profileError}` };
      return { ok: true };
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
    if (signUpError || !signUpData.user) {
      const message = signUpError?.message ?? 'Réponse invalide (aucun utilisateur créé).';
      console.warn('[sync] Échec connexion/inscription Supabase :', message);
      return { ok: false, error: `Inscription échouée : ${message}` };
    }
    const profileError = await upsertOwnProfile(signUpData.user.id, identifiant, nom, role);
    if (profileError) return { ok: false, error: `Profil non enregistré : ${profileError}` };
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] syncSignIn a échoué (hors-ligne ?) :', err);
    return { ok: false, error: `Exception : ${message}` };
  }
}

async function upsertOwnProfile(id: string, identifiant: string, nom: string, role: Role): Promise<string | undefined> {
  if (!supabase) return undefined;
  const { error } = await supabase
    .from('profiles')
    .upsert({ id, identifiant: identifiant.trim().toLowerCase(), nom, role, actif: true });
  return error?.message;
}

export async function syncSignOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut().catch(() => {});
}

// Utilisé par l'écran Comptes quand le Gérant change le rôle ou révoque un accès.
// Une MISE À JOUR (pas une création) : utilise la session déjà active du Gérant,
// donc ne bascule jamais la session de l'appareil vers un autre utilisateur.
// Le compte cloud du nouvel utilisateur (s'il n'existe pas encore) se crée tout
// seul, sans risque, la première fois que CET utilisateur se connecte lui-même
// (voir syncSignIn ci-dessus) — jamais depuis l'appareil du Gérant.
export async function syncUpdateProfile(identifiant: string, changes: { role?: Role; actif?: boolean }): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('profiles').update(changes).eq('identifiant', identifiant.trim().toLowerCase());
  } catch (err) {
    console.warn('[sync] syncUpdateProfile a échoué (hors-ligne ?) :', err);
  }
}
