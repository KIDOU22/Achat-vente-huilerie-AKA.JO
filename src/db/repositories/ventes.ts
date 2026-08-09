import type { SQLiteDatabase } from 'expo-sqlite';
import { uid } from '../../domain/format';
import type { Vente } from '../../domain/types';
import { logAudit } from './audit';

interface VenteRow {
  id: string;
  num: number;
  num_ticket: string;
  client: string;
  chauffeur: string;
  type_vehicule: string;
  immatriculation: string;
  poids_charge: number;
  poids_vide: number;
  net: number;
  prix_litre: number;
  montant: number;
  prix_transport_kg: number;
  montant_transport: number;
  ts: number;
  created_by: string;
}

function toVente(row: VenteRow): Vente {
  return {
    id: row.id,
    num: row.num,
    numTicketPesee: row.num_ticket,
    client: row.client,
    chauffeur: row.chauffeur,
    typeVehicule: row.type_vehicule,
    immatriculation: row.immatriculation,
    poidsCharge: row.poids_charge,
    poidsVide: row.poids_vide,
    net: row.net,
    prixLitre: row.prix_litre,
    montant: row.montant,
    prixTransportKg: row.prix_transport_kg,
    montantTransport: row.montant_transport,
    ts: row.ts,
    createdBy: row.created_by,
  };
}

export async function listVentes(db: SQLiteDatabase): Promise<Vente[]> {
  const rows = await db.getAllAsync<VenteRow>('SELECT * FROM ventes ORDER BY ts DESC');
  return rows.map(toVente);
}

export interface CreateVenteInput {
  numTicketPesee: string;
  client: string;
  chauffeur: string;
  typeVehicule: string;
  immatriculation: string;
  poidsCharge: number;
  poidsVide: number;
  prixLitre: number;
  prixTransportKg: number;
  userId: string;
  userNom: string;
}

export async function createVente(db: SQLiteDatabase, input: CreateVenteInput): Promise<Vente> {
  const net = Math.max(0, input.poidsCharge - input.poidsVide);
  const montant = Math.round(net * input.prixLitre);
  const montantTransport = Math.round(net * input.prixTransportKg);
  const id = uid();
  const ts = Date.now();
  const countRow = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM ventes');
  const num = (countRow?.count ?? 0) + 1;

  await db.runAsync(
    `INSERT INTO ventes (id, num, num_ticket, client, chauffeur, type_vehicule, immatriculation, poids_charge, poids_vide, net, prix_litre, montant, prix_transport_kg, montant_transport, ts, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    num,
    input.numTicketPesee.trim(),
    input.client.trim(),
    input.chauffeur.trim(),
    input.typeVehicule,
    input.immatriculation.trim(),
    input.poidsCharge,
    input.poidsVide,
    net,
    input.prixLitre,
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
    entity: 'vente',
    entityId: id,
    details: `Vente ${input.numTicketPesee} — ${net} kg — ${montant} F (+ ${montantTransport} F transport)`,
  });

  return {
    id,
    num,
    numTicketPesee: input.numTicketPesee.trim(),
    client: input.client.trim(),
    chauffeur: input.chauffeur.trim(),
    typeVehicule: input.typeVehicule,
    immatriculation: input.immatriculation.trim(),
    poidsCharge: input.poidsCharge,
    poidsVide: input.poidsVide,
    net,
    prixLitre: input.prixLitre,
    montant,
    prixTransportKg: input.prixTransportKg,
    montantTransport,
    ts,
    createdBy: input.userId,
  };
}
