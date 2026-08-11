import { supabase } from '../lib/supabase';
import type { Caisse, MouvementCaisse, MouvementStatut, Pesee, Planteur, Vente } from '../domain/types';

// Toutes les fonctions ci-dessous sont "best-effort" : si Supabase n'est pas
// configuré ou si l'appareil est hors-ligne, l'erreur est journalisée sans jamais
// interrompre le flux local (l'enregistrement local a déjà réussi avant l'appel de
// ces fonctions). Important : les appels Supabase (.upsert/.update/.delete) NE
// LÈVENT PAS d'exception sur une erreur côté base (RLS refusée, clé étrangère
// violée...) — ils renvoient { error } qu'il faut vérifier explicitement, sinon
// l'échec est totalement invisible (aucune exception, aucun log).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PushResult {
  ok: boolean;
  error?: string;
}

export async function pushPlanteur(p: Planteur): Promise<PushResult> {
  if (!supabase) return { ok: false, error: 'Supabase non configuré' };
  if (!UUID_RE.test(p.id)) return { ok: false, error: 'id local invalide (pas un UUID)' };
  try {
    const { error } = await supabase.from('planteurs').upsert({
      id: p.id,
      nom: p.nom,
      village: p.village,
      tel: p.tel,
      created_at: new Date(p.createdAt).toISOString(),
    });
    if (error) {
      console.warn('[sync] pushPlanteur a échoué :', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] pushPlanteur a échoué :', err);
    return { ok: false, error: message };
  }
}

export async function pushPesee(p: Pesee): Promise<PushResult> {
  if (!supabase) return { ok: false, error: 'Supabase non configuré' };
  if (!UUID_RE.test(p.id) || !UUID_RE.test(p.planteurId)) {
    return { ok: false, error: 'id ou planteurId local invalide (pas un UUID)' };
  }
  try {
    const { error } = await supabase.from('pesees').upsert({
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
    if (error) {
      console.warn('[sync] pushPesee a échoué :', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] pushPesee a échoué :', err);
    return { ok: false, error: message };
  }
}

export async function pushVente(v: Vente): Promise<PushResult> {
  if (!supabase) return { ok: false, error: 'Supabase non configuré' };
  if (!UUID_RE.test(v.id)) return { ok: false, error: 'id local invalide (pas un UUID)' };
  try {
    const { error } = await supabase.from('ventes').upsert({
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
    if (error) {
      console.warn('[sync] pushVente a échoué :', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] pushVente a échoué :', err);
    return { ok: false, error: message };
  }
}

export async function pushPayeStatus(peseeId: string, paye: boolean): Promise<PushResult> {
  if (!supabase) return { ok: false, error: 'Supabase non configuré' };
  if (!UUID_RE.test(peseeId)) return { ok: false, error: 'id local invalide (pas un UUID)' };
  try {
    const { error } = await supabase.from('pesees').update({ paye }).eq('id', peseeId);
    if (error) {
      console.warn('[sync] pushPayeStatus a échoué :', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] pushPayeStatus a échoué :', err);
    return { ok: false, error: message };
  }
}

export async function pushSetting(key: string, value: string): Promise<PushResult> {
  if (!supabase) return { ok: false, error: 'Supabase non configuré' };
  try {
    const { error } = await supabase.from('settings').upsert({ key, value });
    if (error) {
      console.warn('[sync] pushSetting a échoué :', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] pushSetting a échoué :', err);
    return { ok: false, error: message };
  }
}

export async function pushCaisse(c: Caisse): Promise<PushResult> {
  if (!supabase) return { ok: false, error: 'Supabase non configuré' };
  if (!UUID_RE.test(c.id)) return { ok: false, error: 'id local invalide (pas un UUID)' };
  try {
    const { error } = await supabase.from('caisses').upsert({
      id: c.id,
      type: c.type,
      owner_identifiant: c.ownerIdentifiant,
      created_at: new Date(c.createdAt).toISOString(),
    });
    if (error) {
      console.warn('[sync] pushCaisse a échoué :', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] pushCaisse a échoué :', err);
    return { ok: false, error: message };
  }
}

export async function pushMouvement(m: MouvementCaisse): Promise<PushResult> {
  if (!supabase) return { ok: false, error: 'Supabase non configuré' };
  if (!UUID_RE.test(m.id)) return { ok: false, error: 'id local invalide (pas un UUID)' };
  try {
    const { error } = await supabase.from('mouvements_caisse').upsert({
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
    if (error) {
      console.warn('[sync] pushMouvement a échoué :', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] pushMouvement a échoué :', err);
    return { ok: false, error: message };
  }
}

export async function pushMouvementStatus(
  id: string,
  statut: MouvementStatut,
  validatedBy: string,
  validatedByNom: string,
  validatedAt: number
): Promise<PushResult> {
  if (!supabase) return { ok: false, error: 'Supabase non configuré' };
  if (!UUID_RE.test(id)) return { ok: false, error: 'id local invalide (pas un UUID)' };
  try {
    const { error } = await supabase
      .from('mouvements_caisse')
      .update({
        statut,
        validated_by: validatedBy,
        validated_by_nom: validatedByNom,
        validated_at: new Date(validatedAt).toISOString(),
      })
      .eq('id', id);
    if (error) {
      console.warn('[sync] pushMouvementStatus a échoué :', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] pushMouvementStatus a échoué :', err);
    return { ok: false, error: message };
  }
}

export async function pushDeleteMouvementForPesee(peseeId: string): Promise<PushResult> {
  if (!supabase) return { ok: false, error: 'Supabase non configuré' };
  if (!UUID_RE.test(peseeId)) return { ok: false, error: 'id local invalide (pas un UUID)' };
  try {
    const { error } = await supabase.from('mouvements_caisse').delete().eq('pesee_id', peseeId).eq('type', 'depense');
    if (error) {
      console.warn('[sync] pushDeleteMouvementForPesee a échoué :', error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[sync] pushDeleteMouvementForPesee a échoué :', err);
    return { ok: false, error: message };
  }
}
