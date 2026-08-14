export type Role = 'gerant' | 'dirigeant' | 'agent';

export const VEHICULES_REGIME = ['Kia', 'Tricycle', 'Tracteur', 'Remorque benne'] as const;
export type VehiculeRegime = (typeof VEHICULES_REGIME)[number];

export const VEHICULES_HUILE = ['Citerne client', 'Citerne louée'] as const;
export type VehiculeHuile = (typeof VEHICULES_HUILE)[number];

export type Periode = 'jour' | 'semaine' | 'mois' | 'annee';
export type Metrique = 'poids' | 'montant';

export interface User {
  id: string;
  identifiant: string;
  codeHash: string;
  nom: string;
  role: Role;
  actif: boolean;
  doitChangerCode: boolean;
  createdAt: number;
}

export type PartenaireType = 'planteur' | 'pont_independant' | 'chauffeur';

export const PARTENAIRE_TYPE_LABELS: Record<PartenaireType, string> = {
  planteur: 'Planteur',
  pont_independant: 'Pont indépendant',
  chauffeur: 'Chauffeur',
};

// Fournisseur de régime (planteur ou pont indépendant) ou chauffeur — toute
// personne/structure avec qui l'huilerie a une relation financière suivie
// (tonnage livré, montant reçu, solde). "village" sert au planteur,
// "localisation"/"responsable" au pont indépendant ; "tel" est commun aux trois.
export interface Partenaire {
  id: string;
  type: PartenaireType;
  nom: string;
  village: string;
  tel: string;
  localisation: string;
  responsable: string;
  createdAt: number;
}

export interface Pesee {
  id: string;
  num: number;
  numTicketPesee: string;
  planteurId: string;
  chauffeur: string;
  chauffeurId: string | null;
  typeVehicule: string;
  immatriculation: string;
  origine: string;
  poidsCharge: number;
  poidsVide: number;
  net: number;
  prixKg: number;
  montant: number;
  prixTransportKg: number;
  montantTransport: number;
  payeRegime: boolean;
  payeTransport: boolean;
  ts: number;
  createdBy: string;
  annulee: boolean;
  annuleePar: string | null;
  motifAnnulation: string | null;
}

export interface Vente {
  id: string;
  num: number;
  numTicketPesee: string;
  client: string;
  // Texte libre, volontairement pas relié à un partenaire chauffeur : souvent le
  // camion/chauffeur du client lui-même ("Citerne client"), pas un chauffeur de la
  // maison — contrairement à l'achat, voir Pesee.chauffeurId.
  chauffeur: string;
  typeVehicule: string;
  immatriculation: string;
  poidsCharge: number;
  poidsVide: number;
  net: number;
  prixLitre: number;
  montant: number;
  prixTransportKg: number;
  montantTransport: number;
  payeHuile: boolean;
  payeTransport: boolean;
  ts: number;
  createdBy: string;
  annulee: boolean;
  annuleePar: string | null;
  motifAnnulation: string | null;
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
  dirigeant: 'Dirigeant',
  agent: 'Agent pont-bascule',
};

export type CaisseType = 'principale' | 'secondaire' | 'banque';

export interface Caisse {
  id: string;
  type: CaisseType;
  userId: string | null;
  ownerIdentifiant: string | null;
  createdAt: number;
}

export type MouvementType = 'allocation' | 'depense' | 'retour' | 'transfert' | 'apport';
export type MouvementStatut = 'en_attente' | 'validee' | 'rejetee';

export interface MouvementCaisse {
  id: string;
  type: MouvementType;
  caisseFromId: string | null;
  caisseToId: string | null;
  montant: number;
  motif: string;
  statut: MouvementStatut;
  peseeId: string | null;
  venteId: string | null;
  // Non nul pour un règlement enregistré directement contre le solde global d'un
  // partenaire (paiement partiel/échéance, ou paiement groupé de plusieurs
  // livraisons) — plutôt que pour une pesée/vente précise.
  partenaireId: string | null;
  volet: 'produit' | 'transport' | null;
  createdBy: string;
  createdByNom: string;
  validatedBy: string | null;
  validatedByNom: string | null;
  ts: number;
  validatedAt: number | null;
}

export const MOUVEMENT_TYPE_LABELS: Record<MouvementType, string> = {
  allocation: 'Allocation',
  depense: 'Dépense',
  retour: 'Retour caisse principale',
  transfert: 'Transfert',
  apport: 'Apport (dépôt)',
};
