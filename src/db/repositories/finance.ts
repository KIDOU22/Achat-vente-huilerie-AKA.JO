import type { SQLiteDatabase } from 'expo-sqlite';
import { uid } from '../../domain/format';
import type {
  BudgetAnnuel,
  BudgetLigne,
  FinanceCategorie,
  FinanceCategorieType,
  ModePaiement,
  MouvementTresorerie,
} from '../../domain/types';
import { logAudit } from './audit';

// ============================================================
// Module Finance & Comptabilité — Phase 1. Même pattern que
// src/db/repositories/caisses.ts : interface de ligne + mapper toX,
// fonctions paramétrées, actions métier avec logAudit.
// ============================================================

interface CategorieRow {
  id: string;
  type: FinanceCategorieType;
  libelle: string;
  actif: number;
  created_at: number;
}

function toCategorie(row: CategorieRow): FinanceCategorie {
  return { id: row.id, type: row.type, libelle: row.libelle, actif: row.actif === 1, createdAt: row.created_at };
}

export async function listFinanceCategories(db: SQLiteDatabase): Promise<FinanceCategorie[]> {
  const rows = await db.getAllAsync<CategorieRow>('SELECT * FROM finance_categories ORDER BY libelle ASC');
  return rows.map(toCategorie);
}

export async function ajouterFinanceCategorie(
  db: SQLiteDatabase,
  input: { type: FinanceCategorieType; libelle: string; actor: { userId: string; userNom: string } }
): Promise<FinanceCategorie> {
  const id = uid();
  const createdAt = Date.now();
  await db.runAsync(
    'INSERT INTO finance_categories (id, type, libelle, actif, created_at) VALUES (?, ?, ?, 1, ?)',
    id,
    input.type,
    input.libelle.trim(),
    createdAt
  );
  await logAudit(db, {
    userId: input.actor.userId,
    userNom: input.actor.userNom,
    action: 'creer',
    entity: 'finance_categorie',
    entityId: id,
    details: input.libelle.trim(),
  });
  return { id, type: input.type, libelle: input.libelle.trim(), actif: true, createdAt };
}

export async function renommerFinanceCategorie(db: SQLiteDatabase, id: string, libelle: string): Promise<void> {
  await db.runAsync('UPDATE finance_categories SET libelle = ? WHERE id = ?', libelle.trim(), id);
}

export async function toggleFinanceCategorieActif(db: SQLiteDatabase, id: string, actif: boolean): Promise<void> {
  await db.runAsync('UPDATE finance_categories SET actif = ? WHERE id = ?', actif ? 1 : 0, id);
}

interface BudgetRow {
  id: string;
  annee: number;
  solde_ouverture: number;
  date_ouverture: number;
  created_by: string;
  created_at: number;
}

function toBudget(row: BudgetRow): BudgetAnnuel {
  return {
    id: row.id,
    annee: row.annee,
    soldeOuverture: row.solde_ouverture,
    dateOuverture: row.date_ouverture,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function listBudgets(db: SQLiteDatabase): Promise<BudgetAnnuel[]> {
  const rows = await db.getAllAsync<BudgetRow>('SELECT * FROM finance_budgets ORDER BY annee ASC');
  return rows.map(toBudget);
}

export async function creerBudgetAnnuel(
  db: SQLiteDatabase,
  input: { annee: number; soldeOuverture: number; dateOuverture: number; actor: { userId: string; userNom: string } }
): Promise<BudgetAnnuel> {
  const id = uid();
  const createdAt = Date.now();
  await db.runAsync(
    'INSERT INTO finance_budgets (id, annee, solde_ouverture, date_ouverture, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    input.annee,
    input.soldeOuverture,
    input.dateOuverture,
    input.actor.userId,
    createdAt
  );
  await logAudit(db, {
    userId: input.actor.userId,
    userNom: input.actor.userNom,
    action: 'creer',
    entity: 'finance_budget',
    entityId: id,
    details: `Budget ${input.annee} — ouverture ${input.soldeOuverture} F`,
  });
  return {
    id,
    annee: input.annee,
    soldeOuverture: input.soldeOuverture,
    dateOuverture: input.dateOuverture,
    createdBy: input.actor.userId,
    createdAt,
  };
}

interface BudgetLigneRow {
  id: string;
  budget_id: string;
  categorie_id: string;
  mois: number;
  montant_prevu: number;
}

function toBudgetLigne(row: BudgetLigneRow): BudgetLigne {
  return {
    id: row.id,
    budgetId: row.budget_id,
    categorieId: row.categorie_id,
    mois: row.mois,
    montantPrevu: row.montant_prevu,
  };
}

export async function listBudgetLignes(db: SQLiteDatabase): Promise<BudgetLigne[]> {
  const rows = await db.getAllAsync<BudgetLigneRow>('SELECT * FROM finance_budget_lignes');
  return rows.map(toBudgetLigne);
}

// Upsert local par (budget_id, categorie_id, mois) — une cellule de la grille
// budgétaire. Retourne la ligne finale (créée ou mise à jour).
export async function upsertBudgetLigne(
  db: SQLiteDatabase,
  input: { budgetId: string; categorieId: string; mois: number; montantPrevu: number }
): Promise<BudgetLigne> {
  const existing = await db.getFirstAsync<BudgetLigneRow>(
    'SELECT * FROM finance_budget_lignes WHERE budget_id = ? AND categorie_id = ? AND mois = ?',
    input.budgetId,
    input.categorieId,
    input.mois
  );
  if (existing) {
    await db.runAsync('UPDATE finance_budget_lignes SET montant_prevu = ? WHERE id = ?', input.montantPrevu, existing.id);
    return { ...toBudgetLigne(existing), montantPrevu: input.montantPrevu };
  }
  const id = uid();
  await db.runAsync(
    'INSERT INTO finance_budget_lignes (id, budget_id, categorie_id, mois, montant_prevu) VALUES (?, ?, ?, ?, ?)',
    id,
    input.budgetId,
    input.categorieId,
    input.mois,
    input.montantPrevu
  );
  return { id, budgetId: input.budgetId, categorieId: input.categorieId, mois: input.mois, montantPrevu: input.montantPrevu };
}

interface MouvementTresorerieRow {
  id: string;
  ts: number;
  num_piece: string;
  libelle: string;
  categorie_id: string;
  mode_paiement: ModePaiement;
  entree: number;
  sortie: number;
  created_by: string;
  created_by_nom: string;
  created_at: number;
}

function toMouvementTresorerie(row: MouvementTresorerieRow): MouvementTresorerie {
  return {
    id: row.id,
    ts: row.ts,
    numPiece: row.num_piece,
    libelle: row.libelle,
    categorieId: row.categorie_id,
    modePaiement: row.mode_paiement,
    entree: row.entree,
    sortie: row.sortie,
    createdBy: row.created_by,
    createdByNom: row.created_by_nom,
    createdAt: row.created_at,
  };
}

export async function listMouvementsTresorerie(db: SQLiteDatabase): Promise<MouvementTresorerie[]> {
  const rows = await db.getAllAsync<MouvementTresorerieRow>('SELECT * FROM finance_mouvements ORDER BY ts ASC');
  return rows.map(toMouvementTresorerie);
}

export async function ajouterMouvementTresorerie(
  db: SQLiteDatabase,
  input: {
    ts: number;
    numPiece: string;
    libelle: string;
    categorieId: string;
    modePaiement: ModePaiement;
    entree: number;
    sortie: number;
    actor: { userId: string; userNom: string };
  }
): Promise<MouvementTresorerie> {
  const id = uid();
  const createdAt = Date.now();
  await db.runAsync(
    `INSERT INTO finance_mouvements (id, ts, num_piece, libelle, categorie_id, mode_paiement, entree, sortie, created_by, created_by_nom, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.ts,
    input.numPiece.trim(),
    input.libelle.trim(),
    input.categorieId,
    input.modePaiement,
    input.entree,
    input.sortie,
    input.actor.userId,
    input.actor.userNom,
    createdAt
  );
  await logAudit(db, {
    userId: input.actor.userId,
    userNom: input.actor.userNom,
    action: 'creer',
    entity: 'finance_mouvement',
    entityId: id,
    details: `${input.libelle.trim()} — ${input.entree > 0 ? `+${input.entree}` : `-${input.sortie}`} F`,
  });
  return {
    id,
    ts: input.ts,
    numPiece: input.numPiece.trim(),
    libelle: input.libelle.trim(),
    categorieId: input.categorieId,
    modePaiement: input.modePaiement,
    entree: input.entree,
    sortie: input.sortie,
    createdBy: input.actor.userId,
    createdByNom: input.actor.userNom,
    createdAt,
  };
}

export async function supprimerMouvementTresorerie(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('DELETE FROM finance_mouvements WHERE id = ?', id);
}
