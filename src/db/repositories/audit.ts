import type { SQLiteDatabase } from 'expo-sqlite';
import { uid } from '../../domain/format';
import type { AuditEntry } from '../../domain/types';

export interface LogAuditInput {
  userId: string;
  userNom: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
}

// Journal d'audit : qui a créé/modifié/payé quoi et quand (traçabilité en cas de litige).
export async function logAudit(db: SQLiteDatabase, input: LogAuditInput): Promise<void> {
  await db.runAsync(
    'INSERT INTO audit_log (id, ts, user_id, user_nom, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    uid(),
    Date.now(),
    input.userId,
    input.userNom,
    input.action,
    input.entity,
    input.entityId,
    input.details
  );
}

interface AuditRow {
  id: string;
  ts: number;
  user_id: string;
  user_nom: string;
  action: string;
  entity: string;
  entity_id: string;
  details: string;
}

export async function listAudit(db: SQLiteDatabase, limit = 200): Promise<AuditEntry[]> {
  const rows = await db.getAllAsync<AuditRow>('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?', limit);
  return rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    userId: r.user_id,
    userNom: r.user_nom,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    details: r.details,
  }));
}
