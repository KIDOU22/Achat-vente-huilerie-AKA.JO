import type { SQLiteDatabase } from 'expo-sqlite';
import { hashCode, verifyCode } from '../../auth/crypto';
import { uid } from '../../domain/format';
import type { Role, User } from '../../domain/types';

interface UserRow {
  id: string;
  identifiant: string;
  code_hash: string;
  nom: string;
  role: Role;
  actif: number;
  doit_changer_code: number;
  created_at: number;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    identifiant: row.identifiant,
    codeHash: row.code_hash,
    nom: row.nom,
    role: row.role,
    actif: row.actif === 1,
    doitChangerCode: row.doit_changer_code === 1,
    createdAt: row.created_at,
  };
}

export async function listUsers(db: SQLiteDatabase): Promise<User[]> {
  const rows = await db.getAllAsync<UserRow>('SELECT * FROM users ORDER BY created_at ASC');
  return rows.map(toUser);
}

export async function authenticate(db: SQLiteDatabase, identifiant: string, code: string): Promise<User | null> {
  const row = await db.getFirstAsync<UserRow>(
    'SELECT * FROM users WHERE lower(identifiant) = lower(?) AND actif = 1',
    identifiant.trim()
  );
  if (!row) return null;
  const ok = await verifyCode(code.trim(), row.code_hash);
  if (!ok) return null;
  return toUser(row);
}

// Créé par le Gérant avec un identifiant/code provisoires : l'utilisateur doit les
// remplacer par les siens (secrets) à sa toute première connexion.
export async function createUser(
  db: SQLiteDatabase,
  input: { identifiant: string; code: string; nom: string; role: Role }
): Promise<User> {
  const id = uid();
  const createdAt = Date.now();
  const codeHash = await hashCode(input.code);
  await db.runAsync(
    'INSERT INTO users (id, identifiant, code_hash, nom, role, actif, doit_changer_code, created_at) VALUES (?, ?, ?, ?, ?, 1, 1, ?)',
    id,
    input.identifiant.trim(),
    codeHash,
    input.nom.trim(),
    input.role,
    createdAt
  );
  await db.runAsync(
    "INSERT INTO caisses (id, type, user_id, owner_identifiant, created_at) VALUES (?, 'secondaire', ?, ?, ?)",
    uid(),
    id,
    input.identifiant.trim().toLowerCase(),
    createdAt
  );
  return {
    id,
    identifiant: input.identifiant.trim(),
    codeHash,
    nom: input.nom.trim(),
    role: input.role,
    actif: true,
    doitChangerCode: true,
    createdAt,
  };
}

export async function changeUserRole(db: SQLiteDatabase, id: string, role: Role): Promise<void> {
  await db.runAsync('UPDATE users SET role = ? WHERE id = ?', role, id);
}

export async function renameUser(db: SQLiteDatabase, id: string, nom: string): Promise<void> {
  await db.runAsync('UPDATE users SET nom = ? WHERE id = ?', nom.trim(), id);
}

// Révoque l'accès ET libère l'identifiant (en le renommant, unique en base et côté
// Supabase) pour qu'il puisse être réutilisé par un nouveau compte — sinon
// "Cet identifiant existe déjà" bloquerait indéfiniment sa recréation.
export async function revokeUser(db: SQLiteDatabase, id: string): Promise<User | null> {
  const before = await getUserById(db, id);
  if (!before) return null;
  const freedIdentifiant = `${before.identifiant}__revoked_${id}`;
  await db.runAsync('UPDATE users SET actif = 0, identifiant = ? WHERE id = ?', freedIdentifiant, id);
  await db.runAsync('UPDATE caisses SET owner_identifiant = ? WHERE user_id = ?', freedIdentifiant.toLowerCase(), id);
  return getUserById(db, id);
}

export async function getUserById(db: SQLiteDatabase, id: string): Promise<User | null> {
  const row = await db.getFirstAsync<UserRow>('SELECT * FROM users WHERE id = ?', id);
  return row ? toUser(row) : null;
}

async function identifiantPris(db: SQLiteDatabase, identifiant: string, excludeUserId: string): Promise<boolean> {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM users WHERE lower(identifiant) = lower(?) AND id != ?',
    identifiant.trim(),
    excludeUserId
  );
  return !!existing;
}

// Utilisé par l'utilisateur lui-même, à sa première connexion (ou après une
// réinitialisation par le Gérant) : remplace l'identifiant/code provisoires par les
// siens, connus de lui seul.
export async function changerIdentifiantEtCode(
  db: SQLiteDatabase,
  userId: string,
  input: { identifiant: string; code: string }
): Promise<User | { error: string }> {
  if (await identifiantPris(db, input.identifiant, userId)) {
    return { error: 'Cet identifiant est déjà utilisé.' };
  }
  const codeHash = await hashCode(input.code);
  await db.runAsync(
    'UPDATE users SET identifiant = ?, code_hash = ?, doit_changer_code = 0 WHERE id = ?',
    input.identifiant.trim(),
    codeHash,
    userId
  );
  // La caisse de l'utilisateur garde une copie de l'identifiant (nécessaire pour la
  // synchro cloud, voir owner_identifiant) — doit rester alignée après ce changement.
  await db.runAsync('UPDATE caisses SET owner_identifiant = ? WHERE user_id = ?', input.identifiant.trim().toLowerCase(), userId);
  const user = await getUserById(db, userId);
  if (!user) return { error: 'Utilisateur introuvable.' };
  return user;
}

// Utilisé par le Gérant : ré-attribue un identifiant/code provisoire (ex: agent qui a
// oublié ses accès), et force l'utilisateur à en recréer des personnels à sa
// prochaine connexion — comme à la création du compte.
export async function reinitialiserAcces(
  db: SQLiteDatabase,
  userId: string,
  input: { identifiant: string; code: string }
): Promise<User | { error: string }> {
  if (await identifiantPris(db, input.identifiant, userId)) {
    return { error: 'Cet identifiant est déjà utilisé.' };
  }
  const codeHash = await hashCode(input.code);
  await db.runAsync(
    'UPDATE users SET identifiant = ?, code_hash = ?, doit_changer_code = 1 WHERE id = ?',
    input.identifiant.trim(),
    codeHash,
    userId
  );
  await db.runAsync('UPDATE caisses SET owner_identifiant = ? WHERE user_id = ?', input.identifiant.trim().toLowerCase(), userId);
  const user = await getUserById(db, userId);
  if (!user) return { error: 'Utilisateur introuvable.' };
  return user;
}
