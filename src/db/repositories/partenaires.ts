import type { SQLiteDatabase } from 'expo-sqlite';
import { uid } from '../../domain/format';
import type { Partenaire, PartenaireType } from '../../domain/types';

interface PartenaireRow {
  id: string;
  type: PartenaireType;
  nom: string;
  village: string;
  tel: string;
  localisation: string;
  responsable: string;
  created_at: number;
}

function toPartenaire(row: PartenaireRow): Partenaire {
  return {
    id: row.id,
    type: row.type,
    nom: row.nom,
    village: row.village,
    tel: row.tel,
    localisation: row.localisation,
    responsable: row.responsable,
    createdAt: row.created_at,
  };
}

export async function listPartenaires(db: SQLiteDatabase): Promise<Partenaire[]> {
  const rows = await db.getAllAsync<PartenaireRow>('SELECT * FROM planteurs ORDER BY nom ASC');
  return rows.map(toPartenaire);
}

export interface CreatePartenaireInput {
  type: PartenaireType;
  nom: string;
  village?: string;
  tel?: string;
  localisation?: string;
  responsable?: string;
}

export async function createPartenaire(db: SQLiteDatabase, input: CreatePartenaireInput): Promise<Partenaire> {
  const id = uid();
  const createdAt = Date.now();
  const village = input.village?.trim() || '—';
  const tel = input.tel?.trim() || '—';
  const localisation = input.localisation?.trim() || '—';
  const responsable = input.responsable?.trim() || '—';
  await db.runAsync(
    'INSERT INTO planteurs (id, type, nom, village, tel, localisation, responsable, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    input.type,
    input.nom.trim(),
    village,
    tel,
    localisation,
    responsable,
    createdAt
  );
  return { id, type: input.type, nom: input.nom.trim(), village, tel, localisation, responsable, createdAt };
}

// Chaque réinstallation de l'app (avant que la synchro cloud ne fonctionne) a
// recréé les planteurs de démo (mêmes nom/village/tel) avec un nouvel identifiant —
// une fois synchronisés, ces doublons se sont retrouvés côté cloud puis propagés
// sur tous les appareils. Fusionne les partenaires strictement identiques (type,
// nom, village, tel) : garde le plus ancien, réattribue les pesées/ventes des
// autres, puis les supprime. Idempotent — sans effet si aucun doublon.
export async function fusionnerPlanteursEnDouble(db: SQLiteDatabase): Promise<void> {
  const groups = await db.getAllAsync<{ type: string; nom: string; village: string; tel: string; count: number }>(
    `SELECT type, nom, village, tel, COUNT(*) as count FROM planteurs
     GROUP BY type, lower(trim(nom)), village, tel
     HAVING COUNT(*) > 1`
  );
  for (const g of groups) {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM planteurs WHERE type = ? AND lower(trim(nom)) = lower(trim(?)) AND village = ? AND tel = ?
       ORDER BY created_at ASC, id ASC`,
      g.type,
      g.nom,
      g.village,
      g.tel
    );
    const [keep, ...extras] = rows;
    for (const extra of extras) {
      await db.runAsync('UPDATE pesees SET planteur_id = ? WHERE planteur_id = ?', keep.id, extra.id);
      await db.runAsync('UPDATE pesees SET chauffeur_id = ? WHERE chauffeur_id = ?', keep.id, extra.id);
      await db.runAsync('UPDATE ventes SET chauffeur_id = ? WHERE chauffeur_id = ?', keep.id, extra.id);
      await db.runAsync('UPDATE mouvements_caisse SET partenaire_id = ? WHERE partenaire_id = ?', keep.id, extra.id);
      await db.runAsync('DELETE FROM planteurs WHERE id = ?', extra.id);
    }
  }
}

// Refuse la suppression tant que des pesées/ventes référencent ce partenaire (la
// contrainte de clé étrangère locale et distante l'empêcherait de toute façon,
// mais un message clair vaut mieux qu'une exception SQLite brute).
export async function deletePartenaire(db: SQLiteDatabase, id: string): Promise<void> {
  const planteurRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM pesees WHERE planteur_id = ?',
    id
  );
  if ((planteurRow?.count ?? 0) > 0) {
    throw new Error('Impossible de supprimer : des pesées lui sont déjà associées.');
  }
  const chauffeurPeseeRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM pesees WHERE chauffeur_id = ?',
    id
  );
  if ((chauffeurPeseeRow?.count ?? 0) > 0) {
    throw new Error('Impossible de supprimer : des pesées lui sont déjà associées (chauffeur).');
  }
  const chauffeurVenteRow = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM ventes WHERE chauffeur_id = ?',
    id
  );
  if ((chauffeurVenteRow?.count ?? 0) > 0) {
    throw new Error('Impossible de supprimer : des ventes lui sont déjà associées (chauffeur).');
  }
  await db.runAsync('DELETE FROM planteurs WHERE id = ?', id);
}

export interface PlanteurTonnage {
  planteurId: string;
  totalNet: number;
  livraisons: number;
}

// Tonnage livré (planteurs et ponts indépendants confondus, distingués par
// partenaireId — le type se lit depuis la liste des partenaires).
export async function tonnageParPlanteur(db: SQLiteDatabase): Promise<Record<string, PlanteurTonnage>> {
  const rows = await db.getAllAsync<{ planteur_id: string; total_net: number; livraisons: number }>(
    'SELECT planteur_id, SUM(net) as total_net, COUNT(*) as livraisons FROM pesees WHERE annulee = 0 GROUP BY planteur_id'
  );
  const map: Record<string, PlanteurTonnage> = {};
  for (const r of rows) {
    map[r.planteur_id] = { planteurId: r.planteur_id, totalNet: r.total_net, livraisons: r.livraisons };
  }
  return map;
}
