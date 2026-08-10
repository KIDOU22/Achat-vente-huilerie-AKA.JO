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
