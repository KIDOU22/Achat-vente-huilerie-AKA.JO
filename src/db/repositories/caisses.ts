import type { SQLiteDatabase } from 'expo-sqlite';
import { uid } from '../../domain/format';
import type { Caisse, MouvementCaisse, MouvementStatut, MouvementType } from '../../domain/types';
import { logAudit } from './audit';

interface CaisseRow {
  id: string;
  type: 'principale' | 'secondaire';
  user_id: string | null;
  owner_identifiant: string | null;
  created_at: number;
}

function toCaisse(row: CaisseRow): Caisse {
  return {
    id: row.id,
    type: row.type,
    userId: row.user_id,
    ownerIdentifiant: row.owner_identifiant,
    createdAt: row.created_at,
  };
}

interface MouvementRow {
  id: string;
  type: MouvementType;
  caisse_from_id: string | null;
  caisse_to_id: string | null;
  montant: number;
  motif: string;
  statut: MouvementStatut;
  pesee_id: string | null;
  created_by: string;
  created_by_nom: string;
  validated_by: string | null;
  validated_by_nom: string | null;
  ts: number;
  validated_at: number | null;
}

function toMouvement(row: MouvementRow): MouvementCaisse {
  return {
    id: row.id,
    type: row.type,
    caisseFromId: row.caisse_from_id,
    caisseToId: row.caisse_to_id,
    montant: row.montant,
    motif: row.motif,
    statut: row.statut,
    peseeId: row.pesee_id,
    createdBy: row.created_by,
    createdByNom: row.created_by_nom,
    validatedBy: row.validated_by,
    validatedByNom: row.validated_by_nom,
    ts: row.ts,
    validatedAt: row.validated_at,
  };
}

export async function listCaisses(db: SQLiteDatabase): Promise<Caisse[]> {
  const rows = await db.getAllAsync<CaisseRow>('SELECT * FROM caisses ORDER BY created_at ASC');
  return rows.map(toCaisse);
}

export async function getCaissePrincipale(db: SQLiteDatabase): Promise<Caisse | null> {
  const row = await db.getFirstAsync<CaisseRow>(
    "SELECT * FROM caisses WHERE type = 'principale' ORDER BY created_at ASC, id ASC LIMIT 1"
  );
  return row ? toCaisse(row) : null;
}

export async function getCaisseBanque(db: SQLiteDatabase): Promise<Caisse | null> {
  const row = await db.getFirstAsync<CaisseRow>(
    "SELECT * FROM caisses WHERE type = 'banque' ORDER BY created_at ASC, id ASC LIMIT 1"
  );
  return row ? toCaisse(row) : null;
}

// Chaque appareil réinstallé avant que la synchro cloud ne fonctionne bien a pu
// créer sa propre caisse "principale"/"banque" (normalement uniques), et sa propre
// caisse "secondaire" pour un identifiant déjà existant ailleurs (ex: "gerant"/
// "bascule1" de démonstration, recréés à chaque installation neuve). Fusionne les
// doublons vers le plus ancien de chaque groupe : réattribue ses mouvements puis
// supprime les autres. Idempotent — sans effet si aucun doublon. Renvoie les id des
// caisses supprimées localement, pour que l'appelant puisse aussi les effacer côté
// Supabase (sinon elles ne réapparaissent pas ici, mais continuent d'exister
// là-bas — voir pull.ts).
export async function fusionnerCaissesUniquesEnDouble(db: SQLiteDatabase): Promise<string[]> {
  const deletedIds: string[] = [];

  for (const type of ['principale', 'banque'] as const) {
    const rows = await db.getAllAsync<{ id: string }>(
      'SELECT id FROM caisses WHERE type = ? ORDER BY created_at ASC, id ASC',
      type
    );
    if (rows.length <= 1) continue;
    const [keep, ...extras] = rows;
    for (const extra of extras) {
      await db.runAsync('UPDATE mouvements_caisse SET caisse_from_id = ? WHERE caisse_from_id = ?', keep.id, extra.id);
      await db.runAsync('UPDATE mouvements_caisse SET caisse_to_id = ? WHERE caisse_to_id = ?', keep.id, extra.id);
      await db.runAsync('DELETE FROM caisses WHERE id = ?', extra.id);
      deletedIds.push(extra.id);
    }
  }

  // Comparaison insensible à la casse/espaces : le même identifiant a pu être
  // enregistré différemment selon l'appareil (ex: "Borgia" vs "borgia"), ce qui
  // empêcherait sinon de reconnaître ces caisses comme des doublons du même compte.
  const owners = await db.getAllAsync<{ owner_identifiant: string }>(
    "SELECT DISTINCT lower(trim(owner_identifiant)) as owner_identifiant FROM caisses WHERE type = 'secondaire' AND owner_identifiant IS NOT NULL"
  );
  for (const { owner_identifiant } of owners) {
    const rows = await db.getAllAsync<{ id: string }>(
      "SELECT id FROM caisses WHERE type = 'secondaire' AND lower(trim(owner_identifiant)) = ? ORDER BY created_at ASC, id ASC",
      owner_identifiant
    );
    if (rows.length <= 1) continue;
    const [keep, ...extras] = rows;
    for (const extra of extras) {
      await db.runAsync('UPDATE mouvements_caisse SET caisse_from_id = ? WHERE caisse_from_id = ?', keep.id, extra.id);
      await db.runAsync('UPDATE mouvements_caisse SET caisse_to_id = ? WHERE caisse_to_id = ?', keep.id, extra.id);
      await db.runAsync('DELETE FROM caisses WHERE id = ?', extra.id);
      deletedIds.push(extra.id);
    }
  }

  return deletedIds;
}

export async function getCaisseForUser(db: SQLiteDatabase, userId: string): Promise<Caisse | null> {
  const row = await db.getFirstAsync<CaisseRow>('SELECT * FROM caisses WHERE user_id = ?', userId);
  return row ? toCaisse(row) : null;
}

// Filet de sécurité appelé à chaque connexion : un utilisateur peut se retrouver sans
// caisse locale pour des raisons historiques (compte recréé pendant les tests, trou
// de synchro passé...) — la carte "Ma caisse" reste alors invisible et ses paiements
// de pesée ne débitent nulle part, sans aucune erreur visible. Crée la caisse
// manquante si besoin (cherche d'abord par identifiant, au cas où elle existerait
// déjà localement sans lien user_id à jour) ; sans effet si elle existe déjà.
export async function ensureCaisseForUser(db: SQLiteDatabase, userId: string, identifiant: string): Promise<Caisse> {
  const parUserId = await getCaisseForUser(db, userId);
  if (parUserId) return parUserId;

  const ownerIdentifiant = identifiant.trim().toLowerCase();
  const parIdentifiant = await db.getFirstAsync<CaisseRow>(
    "SELECT * FROM caisses WHERE type = 'secondaire' AND lower(owner_identifiant) = ?",
    ownerIdentifiant
  );
  if (parIdentifiant) {
    await db.runAsync('UPDATE caisses SET user_id = ? WHERE id = ?', userId, parIdentifiant.id);
    return toCaisse({ ...parIdentifiant, user_id: userId });
  }

  const id = uid();
  const createdAt = Date.now();
  await db.runAsync(
    "INSERT INTO caisses (id, type, user_id, owner_identifiant, created_at) VALUES (?, 'secondaire', ?, ?, ?)",
    id,
    userId,
    ownerIdentifiant,
    createdAt
  );
  return { id, type: 'secondaire', userId, ownerIdentifiant, createdAt };
}

// Filet de sécurité pour les caisses "singleton" (principale, banque), à appeler
// UNIQUEMENT après un tirage (pull) réussi — jamais avant, sinon un appareil qui
// vient d'être vidé croirait à tort qu'elles n'existent pas encore et en créerait de
// nouvelles en double à chaque réinstallation, au lieu de retrouver celles déjà sur
// Supabase. Sans effet si elles existent déjà.
export async function ensureSingletonCaisses(db: SQLiteDatabase): Promise<void> {
  for (const type of ['principale', 'banque'] as const) {
    const existing = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM caisses WHERE type = ?',
      type
    );
    if (!existing || existing.count === 0) {
      await db.runAsync(
        'INSERT INTO caisses (id, type, user_id, created_at) VALUES (?, ?, NULL, ?)',
        uid(),
        type,
        Date.now()
      );
    }
  }
}

export async function listMouvements(db: SQLiteDatabase): Promise<MouvementCaisse[]> {
  const rows = await db.getAllAsync<MouvementRow>('SELECT * FROM mouvements_caisse ORDER BY ts DESC');
  return rows.map(toMouvement);
}

// Solde = somme des mouvements validés reçus - somme des mouvements validés envoyés.
export function soldeCaisse(caisseId: string, mouvements: MouvementCaisse[]): number {
  let solde = 0;
  for (const m of mouvements) {
    if (m.statut !== 'validee') continue;
    if (m.caisseToId === caisseId) solde += m.montant;
    if (m.caisseFromId === caisseId) solde -= m.montant;
  }
  return solde;
}

async function insertMouvement(
  db: SQLiteDatabase,
  input: {
    type: MouvementType;
    caisseFromId: string | null;
    caisseToId: string | null;
    montant: number;
    motif: string;
    statut: MouvementStatut;
    peseeId?: string | null;
    createdBy: string;
    createdByNom: string;
  }
): Promise<MouvementCaisse> {
  const id = uid();
  const ts = Date.now();
  await db.runAsync(
    `INSERT INTO mouvements_caisse
       (id, type, caisse_from_id, caisse_to_id, montant, motif, statut, pesee_id, created_by, created_by_nom, validated_by, validated_by_nom, ts, validated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    id,
    input.type,
    input.caisseFromId,
    input.caisseToId,
    input.montant,
    input.motif.trim(),
    input.statut,
    input.peseeId ?? null,
    input.createdBy,
    input.createdByNom,
    ts,
    input.statut === 'validee' ? ts : null
  );
  return {
    id,
    type: input.type,
    caisseFromId: input.caisseFromId,
    caisseToId: input.caisseToId,
    montant: input.montant,
    motif: input.motif.trim(),
    statut: input.statut,
    peseeId: input.peseeId ?? null,
    createdBy: input.createdBy,
    createdByNom: input.createdByNom,
    validatedBy: null,
    validatedByNom: null,
    ts,
    validatedAt: input.statut === 'validee' ? ts : null,
  };
}

// Le Gérant alimente la caisse d'un utilisateur (agent ou gérant) depuis la caisse
// principale. En attente jusqu'à ce que le destinataire confirme l'avoir reçu — il
// ne doit pas pouvoir devenir effectif sans son accord (voir CaisseScreen).
export async function allouer(
  db: SQLiteDatabase,
  input: { toCaisseId: string; montant: number; motif: string; actor: { userId: string; userNom: string } }
): Promise<MouvementCaisse> {
  const principale = await getCaissePrincipale(db);
  if (!principale) throw new Error('Caisse principale introuvable');
  const m = await insertMouvement(db, {
    type: 'allocation',
    caisseFromId: principale.id,
    caisseToId: input.toCaisseId,
    montant: input.montant,
    motif: input.motif,
    statut: 'en_attente',
    createdBy: input.actor.userId,
    createdByNom: input.actor.userNom,
  });
  await logAudit(db, {
    userId: input.actor.userId,
    userNom: input.actor.userNom,
    action: 'allocation_caisse',
    entity: 'caisse',
    entityId: input.toCaisseId,
    details: `Allocation de ${input.montant} F${input.motif ? ` — ${input.motif}` : ''}`,
  });
  return m;
}

// Apport (dépôt) : le Gérant injecte de l'argent externe (capital, retrait bancaire...)
// directement dans une caisse — typiquement la caisse principale. Pas de caisse
// source (l'argent vient de l'extérieur du système), effectif immédiatement.
export async function enregistrerApport(
  db: SQLiteDatabase,
  input: { caisseId: string; montant: number; motif: string; actor: { userId: string; userNom: string } }
): Promise<MouvementCaisse> {
  const m = await insertMouvement(db, {
    type: 'apport',
    caisseFromId: null,
    caisseToId: input.caisseId,
    montant: input.montant,
    motif: input.motif,
    statut: 'validee',
    createdBy: input.actor.userId,
    createdByNom: input.actor.userNom,
  });
  await logAudit(db, {
    userId: input.actor.userId,
    userNom: input.actor.userNom,
    action: 'apport_caisse',
    entity: 'caisse',
    entityId: input.caisseId,
    details: `Apport de ${input.montant} F${input.motif ? ` — ${input.motif}` : ''}`,
  });
  return m;
}

// Dépense libre : débite directement la caisse de son propriétaire, effective immédiatement.
export async function enregistrerDepense(
  db: SQLiteDatabase,
  input: { caisseId: string; montant: number; motif: string; actor: { userId: string; userNom: string } }
): Promise<MouvementCaisse> {
  const m = await insertMouvement(db, {
    type: 'depense',
    caisseFromId: input.caisseId,
    caisseToId: null,
    montant: input.montant,
    motif: input.motif,
    statut: 'validee',
    createdBy: input.actor.userId,
    createdByNom: input.actor.userNom,
  });
  await logAudit(db, {
    userId: input.actor.userId,
    userNom: input.actor.userNom,
    action: 'depense_caisse',
    entity: 'caisse',
    entityId: input.caisseId,
    details: `Dépense de ${input.montant} F — ${input.motif}`,
  });
  return m;
}

// Dépense automatique : une pesée marquée "payée" débite la caisse de l'agent qui l'a réglée.
// Idempotent — un seul mouvement par pesée, supprimé si la pesée repasse à "impayée".
export async function enregistrerDepensePesee(
  db: SQLiteDatabase,
  input: { caisseId: string; peseeId: string; montant: number; actor: { userId: string; userNom: string } }
): Promise<MouvementCaisse | null> {
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM mouvements_caisse WHERE pesee_id = ? AND type = 'depense'",
    input.peseeId
  );
  if (existing) return null;
  return insertMouvement(db, {
    type: 'depense',
    caisseFromId: input.caisseId,
    caisseToId: null,
    montant: input.montant,
    motif: 'Paiement pesée',
    statut: 'validee',
    peseeId: input.peseeId,
    createdBy: input.actor.userId,
    createdByNom: input.actor.userNom,
  });
}

export async function annulerDepensePesee(db: SQLiteDatabase, peseeId: string): Promise<void> {
  await db.runAsync("DELETE FROM mouvements_caisse WHERE pesee_id = ? AND type = 'depense'", peseeId);
}

// L'agent (ou gérant) demande à retourner de l'argent à la caisse principale : en attente
// jusqu'à validation par le Gérant.
export async function initierRetour(
  db: SQLiteDatabase,
  input: { caisseId: string; montant: number; motif: string; actor: { userId: string; userNom: string } }
): Promise<MouvementCaisse> {
  const principale = await getCaissePrincipale(db);
  if (!principale) throw new Error('Caisse principale introuvable');
  return insertMouvement(db, {
    type: 'retour',
    caisseFromId: input.caisseId,
    caisseToId: principale.id,
    montant: input.montant,
    motif: input.motif,
    statut: 'en_attente',
    createdBy: input.actor.userId,
    createdByNom: input.actor.userNom,
  });
}

// Transfert entre deux caisses (agents/gérants) : en attente jusqu'à validation par le
// destinataire (l'agent ou le gérant qui reçoit dans sa caisse).
export async function initierTransfert(
  db: SQLiteDatabase,
  input: { fromCaisseId: string; toCaisseId: string; montant: number; motif: string; actor: { userId: string; userNom: string } }
): Promise<MouvementCaisse> {
  return insertMouvement(db, {
    type: 'transfert',
    caisseFromId: input.fromCaisseId,
    caisseToId: input.toCaisseId,
    montant: input.montant,
    motif: input.motif,
    statut: 'en_attente',
    createdBy: input.actor.userId,
    createdByNom: input.actor.userNom,
  });
}

export async function validerMouvement(
  db: SQLiteDatabase,
  id: string,
  actor: { userId: string; userNom: string }
): Promise<void> {
  const ts = Date.now();
  await db.runAsync(
    "UPDATE mouvements_caisse SET statut = 'validee', validated_by = ?, validated_by_nom = ?, validated_at = ? WHERE id = ? AND statut = 'en_attente'",
    actor.userId,
    actor.userNom,
    ts,
    id
  );
  await logAudit(db, {
    userId: actor.userId,
    userNom: actor.userNom,
    action: 'valider_mouvement',
    entity: 'mouvement_caisse',
    entityId: id,
    details: '',
  });
}

export async function rejeterMouvement(
  db: SQLiteDatabase,
  id: string,
  actor: { userId: string; userNom: string }
): Promise<void> {
  const ts = Date.now();
  await db.runAsync(
    "UPDATE mouvements_caisse SET statut = 'rejetee', validated_by = ?, validated_by_nom = ?, validated_at = ? WHERE id = ? AND statut = 'en_attente'",
    actor.userId,
    actor.userNom,
    ts,
    id
  );
  await logAudit(db, {
    userId: actor.userId,
    userNom: actor.userNom,
    action: 'rejeter_mouvement',
    entity: 'mouvement_caisse',
    entityId: id,
    details: '',
  });
}
