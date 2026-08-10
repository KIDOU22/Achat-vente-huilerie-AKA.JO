import type { SQLiteDatabase } from 'expo-sqlite';
import { uid } from '../../domain/format';
import type { Pesee } from '../../domain/types';
import { logAudit } from './audit';

interface PeseeRow {
  id: string;
  num: number;
  num_ticket: string;
  planteur_id: string;
  chauffeur: string;
  type_vehicule: string;
  immatriculation: string;
  origine: string;
  poids_charge: number;
  poids_vide: number;
  net: number;
  prix_kg: number;
  montant: number;
  prix_transport_kg: number;
  montant_transport: number;
  paye: number;
  ts: number;
  created_by: string;
  annulee: number;
  annulee_par: string | null;
  motif_annulation: string | null;
}

function toPesee(row: PeseeRow): Pesee {
  return {
    id: row.id,
    num: row.num,
    numTicketPesee: row.num_ticket,
    planteurId: row.planteur_id,
    chauffeur: row.chauffeur,
    typeVehicule: row.type_vehicule,
    immatriculation: row.immatriculation,
    origine: row.origine,
    poidsCharge: row.poids_charge,
    poidsVide: row.poids_vide,
    net: row.net,
    prixKg: row.prix_kg,
    montant: row.montant,
    prixTransportKg: row.prix_transport_kg,
    montantTransport: row.montant_transport,
    paye: row.paye === 1,
    ts: row.ts,
    createdBy: row.created_by,
    annulee: row.annulee === 1,
    annuleePar: row.annulee_par,
    motifAnnulation: row.motif_annulation,
  };
}

export async function listPesees(db: SQLiteDatabase): Promise<Pesee[]> {
  const rows = await db.getAllAsync<PeseeRow>('SELECT * FROM pesees ORDER BY ts DESC');
  return rows.map(toPesee);
}

export interface CreatePeseeInput {
  numTicketPesee: string;
  planteurId: string;
  chauffeur: string;
  typeVehicule: string;
  immatriculation: string;
  origine: string;
  poidsCharge: number;
  poidsVide: number;
  prixKg: number;
  prixTransportKg: number;
  userId: string;
  userNom: string;
}

export async function createPesee(db: SQLiteDatabase, input: CreatePeseeInput): Promise<Pesee> {
  const net = Math.max(0, input.poidsCharge - input.poidsVide);
  const montant = Math.round(net * input.prixKg);
  const montantTransport = Math.round(net * input.prixTransportKg);
  const id = uid();
  const ts = Date.now();
  const countRow = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM pesees');
  const num = (countRow?.count ?? 0) + 1;

  await db.runAsync(
    `INSERT INTO pesees (id, num, num_ticket, planteur_id, chauffeur, type_vehicule, immatriculation, origine, poids_charge, poids_vide, net, prix_kg, montant, prix_transport_kg, montant_transport, paye, ts, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    id,
    num,
    input.numTicketPesee.trim(),
    input.planteurId,
    input.chauffeur.trim(),
    input.typeVehicule,
    input.immatriculation.trim(),
    input.origine.trim() || '—',
    input.poidsCharge,
    input.poidsVide,
    net,
    input.prixKg,
    montant,
    input.prixTransportKg,
    montantTransport,
    ts,
    input.userId
  );

  await logAudit(db, {
    userId: input.userId,
    userNom: input.userNom,
    action: 'create',
    entity: 'pesee',
    entityId: id,
    details: `Achat ${input.numTicketPesee} — ${net} kg — ${montant} F (+ ${montantTransport} F transport)`,
  });

  return {
    id,
    num,
    numTicketPesee: input.numTicketPesee.trim(),
    planteurId: input.planteurId,
    chauffeur: input.chauffeur.trim(),
    typeVehicule: input.typeVehicule,
    immatriculation: input.immatriculation.trim(),
    origine: input.origine.trim() || '—',
    poidsCharge: input.poidsCharge,
    poidsVide: input.poidsVide,
    net,
    prixKg: input.prixKg,
    montant,
    prixTransportKg: input.prixTransportKg,
    montantTransport,
    paye: false,
    ts,
    createdBy: input.userId,
    annulee: false,
    annuleePar: null,
    motifAnnulation: null,
  };
}

// Annulation réservée au Gérant : conserve la pesée (traçabilité) mais l'exclut des
// totaux. N'est jamais supprimée de la base.
export async function annulerPesee(
  db: SQLiteDatabase,
  id: string,
  motif: string,
  actor: { userId: string; userNom: string }
): Promise<void> {
  await db.runAsync(
    'UPDATE pesees SET annulee = 1, annulee_par = ?, motif_annulation = ? WHERE id = ?',
    actor.userId,
    motif.trim(),
    id
  );
  await logAudit(db, {
    userId: actor.userId,
    userNom: actor.userNom,
    action: 'annuler',
    entity: 'pesee',
    entityId: id,
    details: motif.trim(),
  });
}

export async function togglePaye(
  db: SQLiteDatabase,
  id: string,
  paye: boolean,
  actor: { userId: string; userNom: string }
): Promise<void> {
  await db.runAsync('UPDATE pesees SET paye = ? WHERE id = ?', paye ? 1 : 0, id);
  await logAudit(db, {
    userId: actor.userId,
    userNom: actor.userNom,
    action: paye ? 'marquer_paye' : 'marquer_impaye',
    entity: 'pesee',
    entityId: id,
    details: '',
  });
}
