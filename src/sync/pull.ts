import type { SQLiteDatabase } from 'expo-sqlite';
import { supabase } from '../lib/supabase';

// Tire les données distantes (déjà filtrées par les règles RLS côté serveur — un
// agent ne recevra jamais les lignes/colonnes de ventes réservées au gérant) et les
// fusionne dans la base locale. Best-effort : ne fait rien si hors-ligne ou non
// authentifié auprès de Supabase (l'app reste pleinement fonctionnelle en local).
export async function pullAll(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  try {
    // Ordre important : les pesées référencent un planteur local (clé étrangère).
    await pullPlanteurs(db);
    await pullPesees(db);
    await pullVentes(db);
    await pullSettings(db);
  } catch (err) {
    console.warn('[sync] pullAll a échoué :', err);
  }
}

async function pullPlanteurs(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('planteurs').select('*');
  if (error || !data) return;
  for (const row of data) {
    await db.runAsync(
      `INSERT INTO planteurs (id, nom, village, tel, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET nom = excluded.nom, village = excluded.village, tel = excluded.tel`,
      row.id,
      row.nom,
      row.village,
      row.tel,
      new Date(row.created_at).getTime()
    );
  }
}

async function pullPesees(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('pesees').select('*');
  if (error || !data) return;
  for (const row of data) {
    await db.runAsync(
      `INSERT INTO pesees (id, num, num_ticket, planteur_id, chauffeur, type_vehicule, immatriculation, origine,
         poids_charge, poids_vide, net, prix_kg, montant, prix_transport_kg, montant_transport, paye, ts, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         paye = excluded.paye, montant = excluded.montant, montant_transport = excluded.montant_transport`,
      row.id,
      row.num,
      row.num_ticket,
      row.planteur_id,
      row.chauffeur,
      row.type_vehicule,
      row.immatriculation,
      row.origine,
      row.poids_charge,
      row.poids_vide,
      row.net,
      row.prix_kg,
      row.montant,
      row.prix_transport_kg,
      row.montant_transport,
      row.paye ? 1 : 0,
      new Date(row.ts).getTime(),
      row.created_by
    );
  }
}

async function pullVentes(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  // Le gérant lit la table complète (prix/montant inclus) ; un agent ne peut lire
  // que la vue sans colonnes financières — dans ce cas on ignore la synchro des
  // ventes localement plutôt que d'écrire des zéros trompeurs.
  const { data, error } = await supabase.from('ventes').select('*');
  if (error || !data) return;
  for (const row of data) {
    await db.runAsync(
      `INSERT INTO ventes (id, num, num_ticket, client, chauffeur, type_vehicule, immatriculation,
         poids_charge, poids_vide, net, prix_litre, montant, prix_transport_kg, montant_transport, ts, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET montant = excluded.montant, montant_transport = excluded.montant_transport`,
      row.id,
      row.num,
      row.num_ticket,
      row.client,
      row.chauffeur,
      row.type_vehicule,
      row.immatriculation,
      row.poids_charge,
      row.poids_vide,
      row.net,
      row.prix_litre,
      row.montant,
      row.prix_transport_kg,
      row.montant_transport,
      new Date(row.ts).getTime(),
      row.created_by
    );
  }
}

async function pullSettings(db: SQLiteDatabase): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase.from('settings').select('*');
  if (error || !data) return;
  for (const row of data) {
    await db.runAsync(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      row.key,
      row.value
    );
  }
}
