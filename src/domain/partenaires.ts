import { periodKey } from './format';
import type { MouvementCaisse, Partenaire, Periode, Pesee, Vente } from './types';

export interface PartenaireStats {
  partenaireId: string;
  tonnage: number;
  livraisons: number;
  montantDu: number;
  montantPaye: number;
  // montantDu - montantPaye : positif = impayé (on doit au partenaire), négatif =
  // créance (on lui a payé plus que ce qui est dû sur la période/le total considéré).
  solde: number;
}

const VIDE: PartenaireStats = { partenaireId: '', tonnage: 0, livraisons: 0, montantDu: 0, montantPaye: 0, solde: 0 };

function inPeriode(ts: number, filtre?: { periode: Periode; key: string }): boolean {
  if (!filtre) return true;
  return periodKey(new Date(ts), filtre.periode) === filtre.key;
}

// Planteur ou pont indépendant : montant dû = régime livré (pesees.montant), payé
// par volet "produit" — soit pesée par pesée (mouvement lié à pesee_id), soit en
// règlement groupé contre le solde global (mouvement lié directement à partenaireId).
export function statsFournisseurRegime(
  partenaireId: string,
  pesees: Pesee[],
  mouvements: MouvementCaisse[],
  filtre?: { periode: Periode; key: string }
): PartenaireStats {
  let tonnage = 0;
  let livraisons = 0;
  let montantDu = 0;
  const idsPesees = new Set<string>();
  for (const p of pesees) {
    if (p.annulee || p.planteurId !== partenaireId || !inPeriode(p.ts, filtre)) continue;
    tonnage += p.net;
    livraisons += 1;
    montantDu += p.montant;
    idsPesees.add(p.id);
  }
  let montantPaye = 0;
  for (const m of mouvements) {
    if (m.type !== 'depense' || m.volet !== 'produit' || m.statut !== 'validee' || !inPeriode(m.ts, filtre)) continue;
    if (m.partenaireId === partenaireId) {
      montantPaye += m.montant;
    } else if (m.peseeId && idsPesees.has(m.peseeId)) {
      montantPaye += m.montant;
    }
  }
  return { partenaireId, tonnage, livraisons, montantDu, montantPaye, solde: montantDu - montantPaye };
}

// Chauffeur : montant dû = transport régime (pesees.montantTransport), payé par
// volet "transport". Le transport d'une vente n'est PAS compté ici : contrairement
// à l'achat, le chauffeur d'une vente est un texte libre (souvent le camion du
// client lui-même) et n'est jamais relié à une fiche partenaire — voir Vente.chauffeur.
export function statsChauffeur(
  partenaireId: string,
  pesees: Pesee[],
  mouvements: MouvementCaisse[],
  filtre?: { periode: Periode; key: string }
): PartenaireStats {
  let tonnage = 0;
  let livraisons = 0;
  let montantDu = 0;
  const idsPesees = new Set<string>();
  for (const p of pesees) {
    if (p.annulee || p.chauffeurId !== partenaireId || !inPeriode(p.ts, filtre)) continue;
    tonnage += p.net;
    livraisons += 1;
    montantDu += p.montantTransport;
    idsPesees.add(p.id);
  }
  let montantPaye = 0;
  for (const m of mouvements) {
    if (m.type !== 'depense' || m.volet !== 'transport' || m.statut !== 'validee' || !inPeriode(m.ts, filtre)) continue;
    if (m.partenaireId === partenaireId) {
      montantPaye += m.montant;
    } else if (m.peseeId && idsPesees.has(m.peseeId)) {
      montantPaye += m.montant;
    }
  }
  return { partenaireId, tonnage, livraisons, montantDu, montantPaye, solde: montantDu - montantPaye };
}

// Point d'entrée unique : dispatche selon le type du partenaire. Un planteur et un
// pont indépendant se calculent de la même façon (tous deux fournisseurs de régime).
export function statsPartenaire(
  partenaire: Partenaire,
  pesees: Pesee[],
  ventes: Vente[],
  mouvements: MouvementCaisse[],
  filtre?: { periode: Periode; key: string }
): PartenaireStats {
  if (partenaire.type === 'chauffeur') {
    return statsChauffeur(partenaire.id, pesees, mouvements, filtre);
  }
  return statsFournisseurRegime(partenaire.id, pesees, mouvements, filtre);
}

export function statsVide(partenaireId: string): PartenaireStats {
  return { ...VIDE, partenaireId };
}
