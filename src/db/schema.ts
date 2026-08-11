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
  doit_changer_code INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS caisses (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('principale', 'secondaire', 'banque')),
  user_id TEXT,
  owner_identifiant TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_caisses_user ON caisses(user_id);

CREATE TABLE IF NOT EXISTS mouvements_caisse (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('allocation', 'depense', 'retour', 'transfert', 'apport')),
  caisse_from_id TEXT,
  caisse_to_id TEXT,
  montant REAL NOT NULL,
  motif TEXT NOT NULL DEFAULT '',
  statut TEXT NOT NULL CHECK (statut IN ('en_attente', 'validee', 'rejetee')),
  pesee_id TEXT,
  created_by TEXT NOT NULL,
  created_by_nom TEXT NOT NULL,
  validated_by TEXT,
  validated_by_nom TEXT,
  ts INTEGER NOT NULL,
  validated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_mouvements_ts ON mouvements_caisse(ts);
CREATE INDEX IF NOT EXISTS idx_mouvements_from ON mouvements_caisse(caisse_from_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_to ON mouvements_caisse(caisse_to_id);
`;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA_SQL);
  await ensureMouvementsCaisseAllowsApport(db);
  await ensureCaissesAllowsBanque(db);
  await ensureColumn(db, 'pesees', 'prix_transport_kg', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'pesees', 'montant_transport', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'ventes', 'prix_transport_kg', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'ventes', 'montant_transport', 'REAL NOT NULL DEFAULT 0');
  await ensureColumn(db, 'pesees', 'annulee', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'pesees', 'annulee_par', 'TEXT');
  await ensureColumn(db, 'pesees', 'motif_annulation', 'TEXT');
  await ensureColumn(db, 'ventes', 'annulee', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'ventes', 'annulee_par', 'TEXT');
  await ensureColumn(db, 'ventes', 'motif_annulation', 'TEXT');
  await ensureColumn(db, 'users', 'doit_changer_code', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'caisses', 'owner_identifiant', 'TEXT');
  await seedIfEmpty(db);
  await ensureCaissesForExistingUsers(db);
}

// SQLite ne permet pas de modifier une contrainte CHECK existante avec ALTER TABLE :
// sur une base créée avant l'ajout du type "apport", on recrée la table avec la
// nouvelle contrainte et on recopie les données (sans risque, no-op si déjà à jour).
async function ensureMouvementsCaisseAllowsApport(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mouvements_caisse'"
  );
  if (!row || row.sql.includes('apport')) return;

  await db.execAsync('DROP INDEX IF EXISTS idx_mouvements_ts');
  await db.execAsync('DROP INDEX IF EXISTS idx_mouvements_from');
  await db.execAsync('DROP INDEX IF EXISTS idx_mouvements_to');
  await db.execAsync('ALTER TABLE mouvements_caisse RENAME TO mouvements_caisse_old');
  await db.execAsync(`
    CREATE TABLE mouvements_caisse (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('allocation', 'depense', 'retour', 'transfert', 'apport')),
      caisse_from_id TEXT,
      caisse_to_id TEXT,
      montant REAL NOT NULL,
      motif TEXT NOT NULL DEFAULT '',
      statut TEXT NOT NULL CHECK (statut IN ('en_attente', 'validee', 'rejetee')),
      pesee_id TEXT,
      created_by TEXT NOT NULL,
      created_by_nom TEXT NOT NULL,
      validated_by TEXT,
      validated_by_nom TEXT,
      ts INTEGER NOT NULL,
      validated_at INTEGER
    )
  `);
  await db.execAsync('INSERT INTO mouvements_caisse SELECT * FROM mouvements_caisse_old');
  await db.execAsync('DROP TABLE mouvements_caisse_old');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_mouvements_ts ON mouvements_caisse(ts)');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_mouvements_from ON mouvements_caisse(caisse_from_id)');
  await db.execAsync('CREATE INDEX IF NOT EXISTS idx_mouvements_to ON mouvements_caisse(caisse_to_id)');
}

// Même contrainte SQLite qu'au-dessus, pour le type "banque" ajouté sur la table caisses.
async function ensureCaissesAllowsBanque(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'caisses'"
  );
  if (!row || row.sql.includes('banque')) return;

  await db.execAsync('DROP INDEX IF EXISTS idx_caisses_user');
  await db.execAsync('ALTER TABLE caisses RENAME TO caisses_old');
  await db.execAsync(`
    CREATE TABLE caisses (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('principale', 'secondaire', 'banque')),
      user_id TEXT,
      owner_identifiant TEXT,
      created_at INTEGER NOT NULL
    )
  `);
  await db.execAsync('INSERT INTO caisses SELECT * FROM caisses_old');
  await db.execAsync('DROP TABLE caisses_old');
  await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_caisses_user ON caisses(user_id)');
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

  const caissePrincipaleCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM caisses WHERE type = 'principale'"
  );
  if (!caissePrincipaleCount || caissePrincipaleCount.count === 0) {
    await db.runAsync(
      "INSERT INTO caisses (id, type, user_id, created_at) VALUES (?, 'principale', NULL, ?)",
      uid(),
      Date.now()
    );
  }

  const caisseBanqueCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM caisses WHERE type = 'banque'"
  );
  if (!caisseBanqueCount || caisseBanqueCount.count === 0) {
    await db.runAsync(
      "INSERT INTO caisses (id, type, user_id, created_at) VALUES (?, 'banque', NULL, ?)",
      uid(),
      Date.now()
    );
  }
}

// Crée la caisse secondaire manquante pour tout utilisateur qui n'en a pas encore
// (installations mises à jour depuis une version antérieure à cette fonctionnalité).
async function ensureCaissesForExistingUsers(db: SQLiteDatabase): Promise<void> {
  const users = await db.getAllAsync<{ id: string; identifiant: string }>('SELECT id, identifiant FROM users');
  for (const u of users) {
    const existing = await db.getFirstAsync<{ id: string }>('SELECT id FROM caisses WHERE user_id = ?', u.id);
    if (!existing) {
      await db.runAsync(
        "INSERT INTO caisses (id, type, user_id, owner_identifiant, created_at) VALUES (?, 'secondaire', ?, ?, ?)",
        uid(),
        u.id,
        u.identifiant.trim().toLowerCase(),
        Date.now()
      );
    }
  }
}
