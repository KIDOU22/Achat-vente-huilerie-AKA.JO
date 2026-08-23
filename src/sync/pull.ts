import type { SQLiteDatabase } from 'expo-sqlite';
import { verifyCode } from '../auth/crypto';
import { fusionnerCaissesUniquesEnDouble } from '../db/repositories/caisses';
import { fusionnerPlanteursEnDouble } from '../db/repositories/partenaires';
import { supabase } from '../lib/supabase';
import { pushDeleteCaisse } from './push';

// Tire les données distantes (déjà filtrées par les règles RLS côté serveur — un
// agent ne recevra jamais les lignes/colonnes de ventes réservées au gérant) et les
// fusionne dans la base locale. Best-effort : ne fait rien si hors-ligne ou non
// authentifié auprès de Supabase (l'app reste pleinement fonctionnelle en local).
// Renvoie true seulement si un tirage complet a réellement eu lieu (session valide et
// aucune erreur) — les appelants qui déduisent "cette caisse n'existe pas encore" de
// l'absence locale APRÈS un pull (ex: ensureSingletonCaisses) doivent vérifier cette
// valeur : sans ça, un pull qui n'a rien pu faire (pas encore de session juste après
// une connexion, ou une coupure réseau) serait pris pour un pull qui a confirmé
// l'absence de la caisse — et en créerait un doublon dans le cloud à chaque fois. Voir
// la migration 0019_dedup_caisses_singleton.sql, qui nettoie les doublons déjà
// accumulés côté Supabase pour cette raison.
export async function pullAll(db: SQLiteDatabase): Promise<boolean> {
  if (!supabase) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false;

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
    // Finance & Comptabilité (Phase 1) — les lignes de budget référencent un budget
    // et une catégorie locale, les mouvements référencent une catégorie : ordre
    // catégories → budgets → lignes → mouvements.
    await pullFinanceCategories(db);
    await pullBudgets(db);
    await pullBudgetLignes(db);
    await pullMouvementsTresorerie(db);
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
    return true;
  } catch (err) {
    console.warn('[sync] pullAll a échoué :', err);
    return false;
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
      `INSERT INTO planteurs (id, type, nom, village, tel, localisation, responsable, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         type = excluded.type, nom = excluded.nom, village = excluded.village, tel = excluded.tel,
         localisation = excluded.localisation, responsable = excluded.responsable`,
      row.id,
      row.type ?? 'planteur',
      row.nom,
      row.village,
      row.tel,
      row.localisation ?? '—',
      row.responsable ?? '—',
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
      `INSERT INTO pesees (id, num, num_ticket, planteur_id, chauffeur, chauffeur_id, type_vehicule, immatriculation, origine,
         poids_charge, poids_vide, net, prix_kg, montant, prix_transport_kg, montant_transport, paye_regime, paye_transport, ts, created_by,
         annulee, annulee_par, motif_annulation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         chauffeur = excluded.chauffeur, chauffeur_id = excluded.chauffeur_id,
         paye_regime = excluded.paye_regime, paye_transport = excluded.paye_transport,
         montant = excluded.montant, montant_transport = excluded.montant_transport,
         annulee = excluded.annulee, annulee_par = excluded.annulee_par, motif_annulation = excluded.motif_annulation`,
      row.id,
      row.num,
      row.num_ticket,
      row.planteur_id,
      row.chauffeur,
      row.chauffeur_id,
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
      row.paye_regime ? 1 : 0,
      row.paye_transport ? 1 : 0,
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
         poids_charge, poids_vide, net, prix_litre, montant, prix_transport_kg, montant_transport, paye_huile, paye_transport, ts, created_by,
         annulee, annulee_par, motif_annulation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET montant = excluded.montant, montant_transport = excluded.montant_transport,
         chauffeur = excluded.chauffeur,
         paye_huile = excluded.paye_huile, paye_transport = excluded.paye_transport,
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
      row.paye_huile ? 1 : 0,
      row.paye_transport ? 1 : 0,
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
  // Une réponse vide (mais sans erreur explicite) ne doit jamais déclencher la
  // réconciliation ci-dessous : elle supprimerait alors TOUTES les caisses locales,
  // y compris celle de l'utilisateur courant — un incident réseau ou RLS transitoire
  // ne doit jamais pouvoir effacer des données locales légitimes.
  if (error || !data || data.length === 0) return;
  const remoteIds = new Set<string>();
  for (const row of data) {
    remoteIds.add(row.id);
    // Une ligne isolée malformée (héritage d'un vieux doublon, d'une fusion passée...)
    // ne doit jamais interrompre le reste du tirage : pullAll est séquentiel — une
    // exception ici remonterait jusqu'à son try/catch global et annulerait TOUT ce qui
    // suit (mouvements_caisse, puis la fusion des doublons), pour tout le monde, alors
    // que les pesées/ventes tirées juste avant auraient déjà été enregistrées — cause
    // plausible d'une synchro "achats OK mais caisses jamais à jour".
    try {
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
    } catch (err) {
      console.warn('[sync] pullCaisses : ligne ignorée', row.id, err);
    }
  }
  // Une caisse fusionnée/supprimée côté Supabase (voir fusionnerCaissesUniquesEnDouble)
  // doit aussi disparaître ici — sinon la prochaine repousse automatique de cet
  // appareil la recréerait là-bas (un upsert sur un id qui n'existe plus le réinsère).
  const localRows = await db.getAllAsync<{ id: string }>('SELECT id FROM caisses');
  for (const { id } of localRows) {
    if (!remoteIds.has(id)) {
      await db.runAsync('DELETE FROM caisses WHERE id = ?', id);
    }
  }
}

async function pullMouvements(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('mouvements_caisse').select('*');
  if (error || !data) return;
  for (const row of data) {
    // Voir le commentaire équivalent dans pullCaisses ci-dessus : une ligne isolée
    // malformée ne doit jamais faire échouer tout le reste du tirage pour tout le
    // monde.
    try {
      await db.runAsync(
        `INSERT INTO mouvements_caisse
           (id, type, caisse_from_id, caisse_to_id, montant, motif, statut, pesee_id, vente_id, partenaire_id, volet, created_by, created_by_nom, validated_by, validated_by_nom, ts, validated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           statut = excluded.statut, validated_by = excluded.validated_by,
           validated_by_nom = excluded.validated_by_nom, validated_at = excluded.validated_at,
           caisse_from_id = excluded.caisse_from_id, caisse_to_id = excluded.caisse_to_id,
           montant = excluded.montant, volet = excluded.volet, partenaire_id = excluded.partenaire_id`,
        row.id,
        row.type,
        row.caisse_from_id,
        row.caisse_to_id,
        row.montant,
        row.motif,
        row.statut,
        row.pesee_id,
        row.vente_id,
        row.partenaire_id,
        row.volet,
        row.created_by,
        row.created_by_nom,
        row.validated_by,
        row.validated_by_nom,
        new Date(row.ts).getTime(),
        row.validated_at ? new Date(row.validated_at).getTime() : null
      );
    } catch (err) {
      console.warn('[sync] pullMouvements : ligne ignorée', row.id, err);
    }
  }
}

// ============================================================
// Module Finance & Comptabilité — Phase 1.
// ============================================================

async function pullFinanceCategories(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('finance_categories').select('*');
  if (error || !data) return;
  for (const row of data) {
    try {
      await db.runAsync(
        `INSERT INTO finance_categories (id, type, libelle, actif, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET libelle = excluded.libelle, actif = excluded.actif`,
        row.id,
        row.type,
        row.libelle,
        row.actif ? 1 : 0,
        new Date(row.created_at).getTime()
      );
    } catch (err) {
      console.warn('[sync] pullFinanceCategories : ligne ignorée', row.id, err);
    }
  }
}

async function pullBudgets(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('finance_budgets').select('*');
  if (error || !data) return;
  for (const row of data) {
    try {
      await db.runAsync(
        `INSERT INTO finance_budgets (id, annee, solde_ouverture, date_ouverture, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET solde_ouverture = excluded.solde_ouverture, date_ouverture = excluded.date_ouverture`,
        row.id,
        row.annee,
        row.solde_ouverture,
        new Date(row.date_ouverture).getTime(),
        row.created_by,
        new Date(row.created_at).getTime()
      );
    } catch (err) {
      console.warn('[sync] pullBudgets : ligne ignorée', row.id, err);
    }
  }
}

async function pullBudgetLignes(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('finance_budget_lignes').select('*');
  if (error || !data) return;
  for (const row of data) {
    try {
      await db.runAsync(
        `INSERT INTO finance_budget_lignes (id, budget_id, categorie_id, mois, montant_prevu) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET montant_prevu = excluded.montant_prevu`,
        row.id,
        row.budget_id,
        row.categorie_id,
        row.mois,
        row.montant_prevu
      );
    } catch (err) {
      console.warn('[sync] pullBudgetLignes : ligne ignorée', row.id, err);
    }
  }
}

async function pullMouvementsTresorerie(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('finance_mouvements').select('*');
  // Comme pullCaisses : une réponse vide sans erreur ne doit jamais déclencher la
  // réconciliation ci-dessous, qui supprimerait alors tous les mouvements locaux.
  if (error || !data || data.length === 0) return;
  for (const row of data) {
    try {
      await db.runAsync(
        `INSERT INTO finance_mouvements (id, ts, num_piece, libelle, categorie_id, mode_paiement, entree, sortie, created_by, created_by_nom, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           libelle = excluded.libelle, categorie_id = excluded.categorie_id, mode_paiement = excluded.mode_paiement,
           entree = excluded.entree, sortie = excluded.sortie, num_piece = excluded.num_piece`,
        row.id,
        new Date(row.ts).getTime(),
        row.num_piece,
        row.libelle,
        row.categorie_id,
        row.mode_paiement,
        row.entree,
        row.sortie,
        row.created_by,
        row.created_by_nom,
        new Date(row.created_at).getTime()
      );
    } catch (err) {
      console.warn('[sync] pullMouvementsTresorerie : ligne ignorée', row.id, err);
    }
  }
  // Un mouvement supprimé (voir supprimerMouvementTresorerie) doit disparaître ici
  // aussi, sinon la prochaine repousse locale le recréerait côté Supabase.
  const remoteIds = new Set(data.map((r) => r.id));
  const localRows = await db.getAllAsync<{ id: string }>('SELECT id FROM finance_mouvements');
  for (const { id } of localRows) {
    if (!remoteIds.has(id)) {
      await db.runAsync('DELETE FROM finance_mouvements WHERE id = ?', id);
    }
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
