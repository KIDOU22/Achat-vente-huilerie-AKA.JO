import type { SQLiteDatabase } from 'expo-sqlite';
import { hashCode } from '../auth/crypto';
import { uid } from '../domain/format';

export const DATABASE_NAME = 'huilerie-akajo.db';

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  identifiant TEXT UNIQUE NOT NULL,
  code_hash TEXT NOT NULL,
  nom TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('gerant', 'agent')),
  actif INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS planteurs (
  id TEXT PRIMARY KEY NOT NULL,
  nom TEXT NOT NULL,
  village TEXT NOT NULL DEFAULT '—',
  tel TEXT NOT NULL DEFAULT '—',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pesees (
  id TEXT PRIMARY KEY NOT NULL,
  num INTEGER NOT NULL,
  num_ticket TEXT NOT NULL,
  planteur_id TEXT NOT NULL REFERENCES planteurs(id),
  chauffeur TEXT NOT NULL,
  type_vehicule TEXT NOT NULL,
  immatriculation TEXT NOT NULL,
  origine TEXT NOT NULL DEFAULT '—',
  poids_charge REAL NOT NULL,
  poids_vide REAL NOT NULL,
  net REAL NOT NULL,
  prix_kg REAL NOT NULL,
  montant REAL NOT NULL,
  prix_transport_kg REAL NOT NULL DEFAULT 0,
  montant_transport REAL NOT NULL DEFAULT 0,
  paye INTEGER NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pesees_ts ON pesees(ts);
CREATE INDEX IF NOT EXISTS idx_pesees_planteur ON pesees(planteur_id);

CREATE TABLE IF NOT EXISTS ventes (
  id TEXT PRIMARY KEY NOT NULL,
  num INTEGER NOT NULL,
  num_ticket TEXT NOT NULL,
  client TEXT NOT NULL,
  chauffeur TEXT NOT NULL,
  type_vehicule TEXT NOT NULL,
  immatriculation TEXT NOT NULL,
  poids_charge REAL NOT NULL,
  poids_vide REAL NOT NULL,
  net REAL NOT NULL,
  prix_litre REAL NOT NULL,
  montant REAL NOT NULL,
  prix_transport_kg REAL NOT NULL DEFAULT 0,
  montant_transport REAL NOT NULL DEFAULT 0,
  ts INTEGER NOT NULL,
  created_by TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ventes_ts ON ventes(ts);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  ts INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  user_nom TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
`;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA_SQL);
  await ensureColumn(db, 'pesees', 'prix_transport_kg', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'pesees', 'montant_transport', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'ventes', 'prix_transport_kg', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'ventes', 'montant_transport', 'REAL NOT NULL DEFAULT 0');
  await seedIfEmpty(db);
}

// Ajoute une colonne manquante sur une base existante (installations déjà en place avant cette version du schéma).
async function ensureColumn(db: SQLiteDatabase, table: string, column: string, definition: string): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function seedSettingIfMissing(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  const existing = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key);
  if (!existing) {
    await db.runAsync('INSERT INTO settings (key, value) VALUES (?, ?)', key, value);
  }
}

async function seedIfEmpty(db: SQLiteDatabase): Promise<void> {
  const userCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users');
  if (!userCount || userCount.count === 0) {
    const now = Date.now();
    await db.runAsync(
      'INSERT INTO users (id, identifiant, code_hash, nom, role, actif, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
      uid(),
      'gerant',
      await hashCode('1234'),
      'Roland',
      'gerant',
      now
    );
    await db.runAsync(
      'INSERT INTO users (id, identifiant, code_hash, nom, role, actif, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
      uid(),
      'bascule1',
      await hashCode('0000'),
      'Agent Bascule 1',
      'agent',
      now
    );
  }

  const planteurCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM planteurs');
  if (!planteurCount || planteurCount.count === 0) {
    const now = Date.now();
    const seedPlanteurs = [
      { nom: 'Kouassi Yao', village: 'Grabo Centre', tel: '07 12 34 56' },
      { nom: 'Bamba Souleymane', village: 'Tabou Route', tel: '05 88 21 40' },
      { nom: "N'Guessan Affoué", village: 'Grabo Centre', tel: '01 45 90 12' },
    ];
    for (const p of seedPlanteurs) {
      await db.runAsync(
        'INSERT INTO planteurs (id, nom, village, tel, created_at) VALUES (?, ?, ?, ?, ?)',
        uid(),
        p.nom,
        p.village,
        p.tel,
        now
      );
    }
  }

  await seedSettingIfMissing(db, 'prixKg', '115');
  await seedSettingIfMissing(db, 'prixLitre', '950');
  await seedSettingIfMissing(db, 'prixTransportRegime', '10');
}
