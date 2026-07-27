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

export async function createUser(
  db: SQLiteDatabase,
  input: { identifiant: string; code: string; nom: string; role: Role }
): Promise<User> {
  const id = uid();
  const createdAt = Date.now();
  const codeHash = await hashCode(input.code);
  await db.runAsync(
    'INSERT INTO users (id, identifiant, code_hash, nom, role, actif, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
    id,
    input.identifiant.trim(),
    codeHash,
    input.nom.trim(),
    input.role,
    createdAt
  );
  return { id, identifiant: input.identifiant.trim(), codeHash, nom: input.nom.trim(), role: input.role, actif: true, createdAt };
}

export async function changeUserRole(db: SQLiteDatabase, id: string, role: Role): Promise<void> {
  await db.runAsync('UPDATE users SET role = ? WHERE id = ?', role, id);
}

export async function revokeUser(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync('UPDATE users SET actif = 0 WHERE id = ?', id);
}

export async function getUserById(db: SQLiteDatabase, id: string): Promise<User | null> {
  const row = await db.getFirstAsync<UserRow>('SELECT * FROM users WHERE id = ?', id);
  return row ? toUser(row) : null;
}
