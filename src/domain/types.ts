export type Role = 'gerant' | 'agent';

export const VEHICULES = ['Kia', 'Tricycle', 'Tracteur', 'Remorque benne'] as const;
export type Vehicule = (typeof VEHICULES)[number];

export type Periode = 'jour' | 'semaine' | 'mois' | 'annee';
export type Metrique = 'poids' | 'montant';

export interface User {
  id: string;
  identifiant: string;
  codeHash: string;
  nom: string;
  role: Role;
  actif: boolean;
  createdAt: number;
}

export interface Planteur {
  id: string;
  nom: string;
  village: string;
  tel: string;
  createdAt: number;
}

export interface Pesee {
  id: string;
  num: number;
  numTicketPesee: string;
  planteurId: string;
  chauffeur: string;
  typeVehicule: string;
  immatriculation: string;
  origine: string;
  poidsCharge: number;
  poidsVide: number;
  net: number;
  prixKg: number;
  montant: number;
  paye: boolean;
  ts: number;
  createdBy: string;
}

export interface Vente {
  id: string;
  num: number;
  numTicketPesee: string;
  client: string;
  chauffeur: string;
  typeVehicule: string;
  immatriculation: string;
  poidsCharge: number;
  poidsVide: number;
  net: number;
  prixLitre: number;
  montant: number;
  ts: number;
  createdBy: string;
}

export interface AuditEntry {
  id: string;
  ts: number;
  userId: string;
  userNom: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
}

export const ROLE_LABELS: Record<Role, string> = {
  gerant: 'Gérant',
  agent: 'Agent pont-bascule',
};
