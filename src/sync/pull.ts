import type { SQLiteDatabase } from 'expo-sqlite';
import { verifyCode } from '../auth/crypto';
import { fusionnerCaissesUniquesEnDouble } from '../db/repositories/caisses';
import { fusionnerPlanteursEnDouble } from '../db/repositories/planteurs';
import { supabase } from '../lib/supabase';
import { pushDeleteCaisse } from './push';

// Tire les données distantes (déjà filtrées par les règles RLS côté serveur — un
// agent ne recevra jamais les lignes/colonnes de ventes réservées au gérant) et les
// fusionne dans la base locale. Best-effort : ne fait rien si hors-ligne ou non
// authentifié auprès de Supabase (l'app reste pleinement fonctionnelle en local).
export async function pullAll(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  try {
    // Ordre important : les pesées référencent un planteur local (clé étrangère), et
    // les mouvements référencent des caisses locales (clé étrangère implicite). Les
    // comptes d'abord : pullCaisses recherche l'utilisateur local par identifiant.
    await pullUsers(db);
    await pullPlanteurs(db);
    await pullPesees(db);
    await pullVentes(db);
    await pullSettings(db);
    await pullCaisses(db);
    await pullMouvements(db);
    // Deux appareils réinstallés avant que la synchro ne fonctionne ont pu chacun
    // créer leur propre caisse "principale"/"banque"/"secondaire", ou les mêmes
    // planteurs de démo — une synchro peut donc en ramener plusieurs : on les
    // fusionne à chaque fois par sécurité. Les caisses fusionnées localement sont
    // aussi supprimées côté Supabase (best-effort) : sinon elles restent invisibles
    // ici mais continuent d'exister là-bas, et un autre appareil les retélécharge.
    const deletedCaisseIds = await fusionnerCaissesUniquesEnDouble(db);
    for (const id of deletedCaisseIds) {
      pushDeleteCaisse(id).catch(() => {});
    }
    await fusionnerPlanteursEnDouble(db);
  } catch (err) {
    console.warn('[sync] pullAll a échoué :', err);
  }
}

interface LocalAccountRow {
  id: string;
  identifiant: string;
  code_hash: string;
  nom: string;
  role: string;
  actif: boolean;
  doit_changer_code: boolean;
  created_at: string;
}

// Une installation neuve amorce localement un gérant/agent de démonstration (mêmes
// identifiants "gerant"/"bascule1" sur chaque appareil, avec un id local différent à
// chaque fois). Si ce compte existe réellement côté cloud sous un autre id local, cet
// ancien doublon de démonstration doit céder la place : sinon la contrainte
// d'unicité locale sur l'identifiant bloquerait la synchro de tous les comptes à
// chaque cycle (created_by n'étant qu'un champ texte libre sur pesées/ventes, aucune
// réattribution de clé étrangère n'est nécessaire avant de le supprimer).
async function upsertLocalUserRow(db: SQLiteDatabase, row: LocalAccountRow): Promise<void> {
  await db.runAsync('DELETE FROM users WHERE lower(identifiant) = lower(?) AND id != ?', row.identifiant, row.id);
  await db.runAsync(
    `INSERT INTO users (id, identifiant, code_hash, nom, role, actif, doit_changer_code, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       identifiant = excluded.identifiant, code_hash = excluded.code_hash, nom = excluded.nom,
       role = excluded.role, actif = excluded.actif, doit_changer_code = excluded.doit_changer_code`,
    row.id,
    row.identifiant,
    row.code_hash,
    row.nom,
    row.role,
    row.actif ? 1 : 0,
    row.doit_changer_code ? 1 : 0,
    new Date(row.created_at).getTime()
  );
}

async function pullUsers(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('local_accounts').select('*');
  if (error || !data) return;
  for (const row of data as LocalAccountRow[]) {
    await upsertLocalUserRow(db, row);
  }
}

// Récupère un compte créé (ou réinitialisé) par le gérant sur un autre appareil et
// jamais encore vu localement ici — utilisable AVANT toute session Supabase
// (contrairement à pullAll/pullUsers ci-dessus, qui exigent une session), car
// "local_accounts" reste lisible sans authentification (voir la migration
// 0011_local_accounts.sql). Vérifie le code fourni avant d'importer quoi que ce soit
// localement. Appelé par AuthContext.login() uniquement quand l'authentification
// locale a déjà échoué.
export async function bootstrapLocalAccount(db: SQLiteDatabase, identifiant: string, code: string): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('local_accounts')
    .select('*')
    .ilike('identifiant', identifiant.trim())
    .maybeSingle();
  if (error || !data) return false;
  const row = data as LocalAccountRow;
  const ok = await verifyCode(code.trim(), row.code_hash);
  if (!ok) return false;
  await upsertLocalUserRow(db, row);
  return true;
}

async function pullPlanteurs(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('planteurs').select('*');
  if (error || !data) return;
  for (const row of data) {
    await db.runAsync(
      `INSERT INTO planteurs (id, nom, village, tel, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET nom = excluded.nom, village = excluded.village, tel = excluded.tel`,
      row.id,
      row.nom,
      row.village,
      row.tel,
      new Date(row.created_at).getTime()
    );
  }
}

async function pullPesees(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('pesees').select('*');
  if (error || !data) return;
  for (const row of data) {
    await db.runAsync(
      `INSERT INTO pesees (id, num, num_ticket, planteur_id, chauffeur, type_vehicule, immatriculation, origine,
         poids_charge, poids_vide, net, prix_kg, montant, prix_transport_kg, montant_transport, paye, ts, created_by,
         annulee, annulee_par, motif_annulation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         paye = excluded.paye, montant = excluded.montant, montant_transport = excluded.montant_transport,
         annulee = excluded.annulee, annulee_par = excluded.annulee_par, motif_annulation = excluded.motif_annulation`,
      row.id,
      row.num,
      row.num_ticket,
      row.planteur_id,
      row.chauffeur,
      row.type_vehicule,
      row.immatriculation,
      row.origine,
      row.poids_charge,
      row.poids_vide,
      row.net,
      row.prix_kg,
      row.montant,
      row.prix_transport_kg,
      row.montant_transport,
      row.paye ? 1 : 0,
      new Date(row.ts).getTime(),
      row.created_by,
      row.annulee ? 1 : 0,
      row.annulee_par,
      row.motif_annulation
    );
  }
}

async function pullVentes(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  // Le gérant lit la table complète (prix/montant inclus) ; un agent ne peut lire
  // que la vue sans colonnes financières — dans ce cas on ignore la synchro des
  // ventes localement plutôt que d'écrire des zéros trompeurs.
  const { data, error } = await supabase.from('ventes').select('*');
  if (error || !data) return;
  for (const row of data) {
    await db.runAsync(
      `INSERT INTO ventes (id, num, num_ticket, client, chauffeur, type_vehicule, immatriculation,
         poids_charge, poids_vide, net, prix_litre, montant, prix_transport_kg, montant_transport, ts, created_by,
         annulee, annulee_par, motif_annulation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET montant = excluded.montant, montant_transport = excluded.montant_transport,
         annulee = excluded.annulee, annulee_par = excluded.annulee_par, motif_annulation = excluded.motif_annulation`,
      row.id,
      row.num,
      row.num_ticket,
      row.client,
      row.chauffeur,
      row.type_vehicule,
      row.immatriculation,
      row.poids_charge,
      row.poids_vide,
      row.net,
      row.prix_litre,
      row.montant,
      row.prix_transport_kg,
      row.montant_transport,
      new Date(row.ts).getTime(),
      row.created_by,
      row.annulee ? 1 : 0,
      row.annulee_par,
      row.motif_annulation
    );
  }
}

async function pullCaisses(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('caisses').select('*');
  if (error || !data) return;
  for (const row of data) {
    const localUser = row.owner_identifiant
      ? await db.getFirstAsync<{ id: string }>(
          'SELECT id FROM users WHERE lower(identifiant) = lower(?)',
          row.owner_identifiant
        )
      : null;
    await db.runAsync(
      `INSERT INTO caisses (id, type, user_id, owner_identifiant, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         owner_identifiant = excluded.owner_identifiant,
         user_id = COALESCE(excluded.user_id, caisses.user_id)`,
      row.id,
      row.type,
      localUser?.id ?? null,
      row.owner_identifiant,
      new Date(row.created_at).getTime()
    );
  }
}

async function pullMouvements(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('mouvements_caisse').select('*');
  if (error || !data) return;
  for (const row of data) {
    await db.runAsync(
      `INSERT INTO mouvements_caisse
         (id, type, caisse_from_id, caisse_to_id, montant, motif, statut, pesee_id, created_by, created_by_nom, validated_by, validated_by_nom, ts, validated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         statut = excluded.statut, validated_by = excluded.validated_by,
         validated_by_nom = excluded.validated_by_nom, validated_at = excluded.validated_at`,
      row.id,
      row.type,
      row.caisse_from_id,
      row.caisse_to_id,
      row.montant,
      row.motif,
      row.statut,
      row.pesee_id,
      row.created_by,
      row.created_by_nom,
      row.validated_by,
      row.validated_by_nom,
      new Date(row.ts).getTime(),
      row.validated_at ? new Date(row.validated_at).getTime() : null
    );
  }
}

async function pullSettings(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('settings').select('*');
  if (error || !data) return;
  for (const row of data) {
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      row.key,
      row.value
    );
  }
}
