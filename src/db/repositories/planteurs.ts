import type { SQLiteDatabase } from 'expo-sqlite';
import { uid } from '../../domain/format';
import type { Planteur } from '../../domain/types';

interface PlanteurRow {
  id: string;
  nom: string;
  village: string;
  tel: string;
  created_at: number;
}

function toPlanteur(row: PlanteurRow): Planteur {
  return { id: row.id, nom: row.nom, village: row.village, tel: row.tel, createdAt: row.created_at };
}

export async function listPlanteurs(db: SQLiteDatabase): Promise<Planteur[]> {
  const rows = await db.getAllAsync<PlanteurRow>('SELECT * FROM planteurs ORDER BY nom ASC');
  return rows.map(toPlanteur);
}

export async function createPlanteur(
  db: SQLiteDatabase,
  input: { nom: string; village: string; tel: string }
): Promise<Planteur> {
  const id = uid();
  const createdAt = Date.now();
  const village = input.village.trim() || '—';
  const tel = input.tel.trim() || '—';
  await db.runAsync(
    'INSERT INTO planteurs (id, nom, village, tel, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    input.nom.trim(),
    village,
    tel,
    createdAt
  );
  return { id, nom: input.nom.trim(), village, tel, createdAt };
}

// Chaque réinstallation de l'app (avant que la synchro cloud ne fonctionne) a
// recréé les planteurs de démo (mêmes nom/village/tel) avec un nouvel identifiant —
// une fois synchronisés, ces doublons se sont retrouvés côté cloud puis propagés
// sur tous les appareils. Fusionne les planteurs strictement identiques (nom,
// village, tel) : garde le plus ancien, réattribue les pesées des autres, puis les
// supprime. Idempotent — sans effet si aucun doublon.
export async function fusionnerPlanteursEnDouble(db: SQLiteDatabase): Promise<void> {
  const groups = await db.getAllAsync<{ nom: string; village: string; tel: string; count: number }>(
    `SELECT nom, village, tel, COUNT(*) as count FROM planteurs
     GROUP BY lower(trim(nom)), village, tel
     HAVING COUNT(*) > 1`
  );
  for (const g of groups) {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM planteurs WHERE lower(trim(nom)) = lower(trim(?)) AND village = ? AND tel = ?
       ORDER BY created_at ASC, id ASC`,
      g.nom,
      g.village,
      g.tel
    );
    const [keep, ...extras] = rows;
    for (const extra of extras) {
      await db.runAsync('UPDATE pesees SET planteur_id = ? WHERE planteur_id = ?', keep.id, extra.id);
      await db.runAsync('DELETE FROM planteurs WHERE id = ?', extra.id);
    }
  }
}

// Refuse la suppression tant que des pesées référencent ce planteur (la contrainte
// de clé étrangère locale et distante l'empêcherait de toute façon, mais un message
// clair vaut mieux qu'une exception SQLite brute).
export async function deletePlanteur(db: SQLiteDatabase, id: string): Promise<void> {
  const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM pesees WHERE planteur_id = ?', id);
  if ((row?.count ?? 0) > 0) {
    throw new Error('Impossible de supprimer ce planteur : des pesées lui sont déjà associées.');
  }
  await db.runAsync('DELETE FROM planteurs WHERE id = ?', id);
}

export interface PlanteurTonnage {
  planteurId: string;
  totalNet: number;
  livraisons: number;
}

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
