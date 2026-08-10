import { supabase } from '../lib/supabase';
import type { Caisse, MouvementCaisse, MouvementStatut, Pesee, Planteur, Vente } from '../domain/types';

// Toutes les fonctions ci-dessous sont "best-effort" : si Supabase n'est pas
// configuré, si l'appareil est hors-ligne, ou si la requête échoue pour toute
// autre raison, l'erreur est journalisée sans jamais interrompre le flux local
// (l'enregistrement local a déjà réussi avant l'appel de ces fonctions).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function pushPlanteur(p: Planteur): Promise<void> {
  if (!supabase || !UUID_RE.test(p.id)) return;
  try {
    await supabase.from('planteurs').upsert({
      id: p.id,
      nom: p.nom,
      village: p.village,
      tel: p.tel,
      created_at: new Date(p.createdAt).toISOString(),
    });
  } catch (err) {
    console.warn('[sync] pushPlanteur a échoué :', err);
  }
}

export async function pushPesee(p: Pesee): Promise<void> {
  if (!supabase || !UUID_RE.test(p.id) || !UUID_RE.test(p.planteurId)) return;
  try {
    await supabase.from('pesees').upsert({
      id: p.id,
      num: p.num,
      num_ticket: p.numTicketPesee,
      planteur_id: p.planteurId,
      chauffeur: p.chauffeur,
      type_vehicule: p.typeVehicule,
      immatriculation: p.immatriculation,
      origine: p.origine,
      poids_charge: p.poidsCharge,
      poids_vide: p.poidsVide,
      net: p.net,
      prix_kg: p.prixKg,
      montant: p.montant,
      prix_transport_kg: p.prixTransportKg,
      montant_transport: p.montantTransport,
      paye: p.paye,
      ts: new Date(p.ts).toISOString(),
      created_by: p.createdBy,
      annulee: p.annulee,
      annulee_par: p.annuleePar,
      motif_annulation: p.motifAnnulation,
    });
  } catch (err) {
    console.warn('[sync] pushPesee a échoué :', err);
  }
}

export async function pushVente(v: Vente): Promise<void> {
  if (!supabase || !UUID_RE.test(v.id)) return;
  try {
    await supabase.from('ventes').upsert({
      id: v.id,
      num: v.num,
      num_ticket: v.numTicketPesee,
      client: v.client,
      chauffeur: v.chauffeur,
      type_vehicule: v.typeVehicule,
      immatriculation: v.immatriculation,
      poids_charge: v.poidsCharge,
      poids_vide: v.poidsVide,
      net: v.net,
      prix_litre: v.prixLitre,
      montant: v.montant,
      prix_transport_kg: v.prixTransportKg,
      montant_transport: v.montantTransport,
      ts: new Date(v.ts).toISOString(),
      created_by: v.createdBy,
      annulee: v.annulee,
      annulee_par: v.annuleePar,
      motif_annulation: v.motifAnnulation,
    });
  } catch (err) {
    console.warn('[sync] pushVente a échoué :', err);
  }
}

export async function pushPayeStatus(peseeId: string, paye: boolean): Promise<void> {
  if (!supabase || !UUID_RE.test(peseeId)) return;
  try {
    await supabase.from('pesees').update({ paye }).eq('id', peseeId);
  } catch (err) {
    console.warn('[sync] pushPayeStatus a échoué :', err);
  }
}

export async function pushSetting(key: string, value: string): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('settings').upsert({ key, value });
  } catch (err) {
    console.warn('[sync] pushSetting a échoué :', err);
  }
}

export async function pushCaisse(c: Caisse): Promise<void> {
  if (!supabase || !UUID_RE.test(c.id)) return;
  try {
    await supabase.from('caisses').upsert({
      id: c.id,
      type: c.type,
      owner_identifiant: c.ownerIdentifiant,
      created_at: new Date(c.createdAt).toISOString(),
    });
  } catch (err) {
    console.warn('[sync] pushCaisse a échoué :', err);
  }
}

export async function pushMouvement(m: MouvementCaisse): Promise<void> {
  if (!supabase || !UUID_RE.test(m.id)) return;
  try {
    await supabase.from('mouvements_caisse').upsert({
      id: m.id,
      type: m.type,
      caisse_from_id: m.caisseFromId,
      caisse_to_id: m.caisseToId,
      montant: m.montant,
      motif: m.motif,
      statut: m.statut,
      pesee_id: m.peseeId,
      created_by: m.createdBy,
      created_by_nom: m.createdByNom,
      validated_by: m.validatedBy,
      validated_by_nom: m.validatedByNom,
      ts: new Date(m.ts).toISOString(),
      validated_at: m.validatedAt ? new Date(m.validatedAt).toISOString() : null,
    });
  } catch (err) {
    console.warn('[sync] pushMouvement a échoué :', err);
  }
}

export async function pushMouvementStatus(
  id: string,
  statut: MouvementStatut,
  validatedBy: string,
  validatedByNom: string,
  validatedAt: number
): Promise<void> {
  if (!supabase || !UUID_RE.test(id)) return;
  try {
    await supabase
      .from('mouvements_caisse')
      .update({
        statut,
        validated_by: validatedBy,
        validated_by_nom: validatedByNom,
        validated_at: new Date(validatedAt).toISOString(),
      })
      .eq('id', id);
  } catch (err) {
    console.warn('[sync] pushMouvementStatus a échoué :', err);
  }
}

export async function pushDeleteMouvementForPesee(peseeId: string): Promise<void> {
  if (!supabase || !UUID_RE.test(peseeId)) return;
  try {
    await supabase.from('mouvements_caisse').delete().eq('pesee_id', peseeId).eq('type', 'depense');
  } catch (err) {
    console.warn('[sync] pushDeleteMouvementForPesee a échoué :', err);
  }
}
