import type { SQLiteDatabase } from 'expo-sqlite';
import { hashCode } from '../auth/crypto';
import { uid } from '../domain/format';
import { isSupabaseConfigured } from '../lib/supabase';
import { fusionnerCaissesUniquesEnDouble } from './repositories/caisses';
import { fusionnerPlanteursEnDouble } from './repositories/partenaires';

export const DATABASE_NAME = 'huilerie-akajo.db';

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  identifiant TEXT UNIQUE NOT NULL,
  code_hash TEXT NOT NULL,
  nom TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('gerant', 'dirigeant', 'agent')),
  actif INTEGER NOT NULL DEFAULT 1,
  doit_changer_code INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS planteurs (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL DEFAULT 'planteur',
  nom TEXT NOT NULL,
  village TEXT NOT NULL DEFAULT '—',
  tel TEXT NOT NULL DEFAULT '—',
  localisation TEXT NOT NULL DEFAULT '—',
  responsable TEXT NOT NULL DEFAULT '—',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS pesees (
  id TEXT PRIMARY KEY NOT NULL,
  num INTEGER NOT NULL,
  num_ticket TEXT NOT NULL,
  planteur_id TEXT NOT NULL REFERENCES planteurs(id),
  chauffeur TEXT NOT NULL,
  chauffeur_id TEXT,
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
  paye_regime INTEGER NOT NULL DEFAULT 0,
  paye_transport INTEGER NOT NULL DEFAULT 0,
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
  paye_huile INTEGER NOT NULL DEFAULT 0,
  paye_transport INTEGER NOT NULL DEFAULT 0,
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
  vente_id TEXT,
  partenaire_id TEXT,
  volet TEXT,
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
  await repareMigrationInterrompue(db);
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
  await ensureColumn(db, 'ventes', 'paye', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'mouvements_caisse', 'vente_id', 'TEXT');
  await ensureColumn(db, 'pesees', 'paye_regime', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'pesees', 'paye_transport', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'ventes', 'paye_huile', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'ventes', 'paye_transport', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn(db, 'mouvements_caisse', 'volet', 'TEXT');
  await backfillPaiementSepare(db);
  await ensureColumn(db, 'planteurs', 'type', "TEXT NOT NULL DEFAULT 'planteur'");
  await ensureColumn(db, 'planteurs', 'localisation', "TEXT NOT NULL DEFAULT '—'");
  await ensureColumn(db, 'planteurs', 'responsable', "TEXT NOT NULL DEFAULT '—'");
  await ensureColumn(db, 'pesees', 'chauffeur_id', 'TEXT');
  await ensureColumn(db, 'mouvements_caisse', 'partenaire_id', 'TEXT');
  await ensureUsersAllowsDirigeant(db);
  await seedIfEmpty(db);
  await fusionnerCaissesUniquesEnDouble(db);
  await fusionnerPlanteursEnDouble(db);
}

// Colonnes réellement présentes sur une table donnée (nom uniquement) — utilisé pour
// recopier des données entre deux formes d'une même table SANS dépendre de l'ordre
// physique des colonnes (voir explication au-dessus de chaque fonction ensure*Allows*
// ci-dessous : un SELECT * associe les colonnes par POSITION, pas par nom, ce qui
// corrompt silencieusement les données — ou viole une contrainte NOT NULL et fait
// planter l'app au démarrage — dès que l'ordre diffère entre l'ancienne et la
// nouvelle table, ce qui arrive dès qu'une colonne a été ajoutée via ensureColumn à
// un moment différent selon l'historique de mises à jour du téléphone).
async function existingColumns(db: SQLiteDatabase, table: string): Promise<Set<string>> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(columns.map((c) => c.name));
}

// Construit la liste "col1, col2, ..." pour un SELECT, en substituant NULL pour
// toute colonne absente de la table source (recréation depuis une base très
// ancienne où cette colonne n'existait pas encore à ce stade de la migration).
function selectListRobuste(colonnes: string[], presentes: Set<string>): string {
  return colonnes.map((c) => (presentes.has(c) ? c : 'NULL')).join(', ');
}

async function tableExiste(db: SQLiteDatabase, table: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    table
  );
  return row != null;
}

// Répare une migration interrompue en plein milieu (l'app tuée par le système entre
// le RENAME d'une table et sa recréation — plausible sur un téléphone bas de gamme,
// notamment juste après l'installation d'une nouvelle version). Avant l'ajout des
// transactions ci-dessous, un tel arrêt laissait la table principale manquante
// (renommée en *_old) : au lancement suivant, tout le reste de migrate() qui suppose
// son existence (ensureColumn, etc.) échouait à nouveau — un plantage systématique à
// chaque ouverture, seule une réinstallation complète (base vidée) rétablissait un
// état cohérent. DOIT s'exécuter AVANT SCHEMA_SQL : un CREATE TABLE IF NOT EXISTS sur
// une table déjà renommée en *_old la recréerait vide, perdant silencieusement les
// données restées coincées dans *_old.
async function repareMigrationInterrompue(db: SQLiteDatabase): Promise<void> {
  for (const table of ['mouvements_caisse', 'caisses', 'users']) {
    const old = `${table}_old`;
    const [principale, sauvegarde] = await Promise.all([tableExiste(db, table), tableExiste(db, old)]);
    if (!principale && sauvegarde) {
      // Arrêt juste après le RENAME : on restaure l'ancienne table pour repartir
      // d'un état cohérent — la migration sera retentée juste après, désormais
      // protégée par une transaction.
      await db.execAsync(`ALTER TABLE ${old} RENAME TO ${table}`);
    } else if (principale && sauvegarde) {
      // Arrêt juste après la copie des données mais avant le nettoyage final : les
      // données utiles sont déjà dans la table principale, la copie est superflue.
      await db.execAsync(`DROP TABLE ${old}`);
    }
  }
}

// SQLite ne permet pas de modifier une contrainte CHECK existante avec ALTER TABLE :
// sur une base créée avant l'ajout du type "apport", on recrée la table avec la
// nouvelle contrainte et on recopie les données (sans risque, no-op si déjà à jour).
// L'ensemble tourne dans une transaction : si l'app est tuée en plein milieu, SQLite
// annule tout au prochain démarrage au lieu de laisser la table à moitié migrée (ce
// qui provoquait un plantage systématique — voir repareMigrationInterrompue).
async function ensureMouvementsCaisseAllowsApport(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mouvements_caisse'"
  );
  if (!row || row.sql.includes('apport')) return;

  await db.withTransactionAsync(async () => {
    await db.execAsync('DROP INDEX IF EXISTS idx_mouvements_ts');
    await db.execAsync('DROP INDEX IF EXISTS idx_mouvements_from');
    await db.execAsync('DROP INDEX IF EXISTS idx_mouvements_to');
    await db.execAsync('ALTER TABLE mouvements_caisse RENAME TO mouvements_caisse_old');
    const presentes = await existingColumns(db, 'mouvements_caisse_old');
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
    const colonnes = [
      'id', 'type', 'caisse_from_id', 'caisse_to_id', 'montant', 'motif', 'statut',
      'pesee_id', 'created_by', 'created_by_nom', 'validated_by', 'validated_by_nom', 'ts', 'validated_at',
    ];
    await db.execAsync(
      `INSERT INTO mouvements_caisse (${colonnes.join(', ')}) SELECT ${selectListRobuste(colonnes, presentes)} FROM mouvements_caisse_old`
    );
    await db.execAsync('DROP TABLE mouvements_caisse_old');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_mouvements_ts ON mouvements_caisse(ts)');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_mouvements_from ON mouvements_caisse(caisse_from_id)');
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_mouvements_to ON mouvements_caisse(caisse_to_id)');
  });
}

// Même contrainte SQLite qu'au-dessus, pour le type "banque" ajouté sur la table
// caisses — également protégé par une transaction, voir le commentaire ci-dessus.
async function ensureCaissesAllowsBanque(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'caisses'"
  );
  if (!row || row.sql.includes('banque')) return;

  await db.withTransactionAsync(async () => {
    await db.execAsync('DROP INDEX IF EXISTS idx_caisses_user');
    await db.execAsync('ALTER TABLE caisses RENAME TO caisses_old');
    const presentes = await existingColumns(db, 'caisses_old');
    await db.execAsync(`
      CREATE TABLE caisses (
        id TEXT PRIMARY KEY NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('principale', 'secondaire', 'banque')),
        user_id TEXT,
        owner_identifiant TEXT,
        created_at INTEGER NOT NULL
      )
    `);
    const colonnes = ['id', 'type', 'user_id', 'owner_identifiant', 'created_at'];
    await db.execAsync(
      `INSERT INTO caisses (${colonnes.join(', ')}) SELECT ${selectListRobuste(colonnes, presentes)} FROM caisses_old`
    );
    await db.execAsync('DROP TABLE caisses_old');
    await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_caisses_user ON caisses(user_id)');
  });
}

// Même contrainte SQLite qu'au-dessus, pour le rôle "dirigeant" ajouté sur la table
// users — également protégé par une transaction, voir le commentaire ci-dessus.
async function ensureUsersAllowsDirigeant(db: SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'"
  );
  if (!row || row.sql.includes('dirigeant')) return;

  await db.withTransactionAsync(async () => {
    await db.execAsync('ALTER TABLE users RENAME TO users_old');
    const presentes = await existingColumns(db, 'users_old');
    await db.execAsync(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY NOT NULL,
        identifiant TEXT UNIQUE NOT NULL,
        code_hash TEXT NOT NULL,
        nom TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('gerant', 'dirigeant', 'agent')),
        actif INTEGER NOT NULL DEFAULT 1,
        doit_changer_code INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `);
    const colonnes = ['id', 'identifiant', 'code_hash', 'nom', 'role', 'actif', 'doit_changer_code', 'created_at'];
    await db.execAsync(
      `INSERT INTO users (${colonnes.join(', ')}) SELECT ${selectListRobuste(colonnes, presentes)} FROM users_old`
    );
    await db.execAsync('DROP TABLE users_old');
  });
}

// Ajoute une colonne manquante sur une base existante (installations déjà en place avant cette version du schéma).
async function ensureColumn(db: SQLiteDatabase, table: string, column: string, definition: string): Promise<void> {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Reprend l'ancien statut "payé" (unique, régime+transport ensemble) pour
// initialiser les deux nouveaux drapeaux indépendants sur une installation déjà
// en place — sans effet sur une installation neuve (colonne "paye" inexistante,
// rien à reprendre). Les mouvements de caisse déjà enregistrés restent groupés
// (historique) ; seule Supabase, source unique, les scinde en deux lignes — voir
// la migration 0016_paiement_separe.sql.
async function backfillPaiementSepare(db: SQLiteDatabase): Promise<void> {
  const peseeColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(pesees)');
  if (peseeColumns.some((c) => c.name === 'paye')) {
    await db.execAsync(
      'UPDATE pesees SET paye_regime = 1, paye_transport = 1 WHERE paye = 1 AND paye_regime = 0 AND paye_transport = 0'
    );
  }
  const venteColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(ventes)');
  if (venteColumns.some((c) => c.name === 'paye')) {
    await db.execAsync(
      'UPDATE ventes SET paye_huile = 1, paye_transport = 1 WHERE paye = 1 AND paye_huile = 0 AND paye_transport = 0'
    );
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

  // Important : sur une installation neuve avec la synchro cloud active, ne JAMAIS
  // créer ces caisses "singleton" ici — une caisse principale/banque doit exister en
  // un seul exemplaire pour tout le monde. Les créer localement avant même d'avoir pu
  // vérifier si elles existent déjà sur Supabase garantit un doublon à chaque
  // réinstallation/vidage de l'app (repoussé au prochain cycle de synchro). Sans
  // Supabase configuré, l'app doit rester utilisable hors-ligne : on les crée alors
  // directement, il n'y a personne d'autre avec qui elles pourraient entrer en
  // conflit. Avec Supabase, ensureSingletonCaisses (appelé après le premier tirage,
  // voir DataContext) prend le relais.
  if (!isSupabaseConfigured) {
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
}
