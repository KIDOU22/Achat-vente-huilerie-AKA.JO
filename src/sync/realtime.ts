import { supabase } from '../lib/supabase';

// S'abonne aux changements Realtime Supabase (règles RLS appliquées par abonné :
// un agent ne recevra jamais d'événement contenant des données de vente masquées).
// Retourne une fonction de désabonnement, ou undefined si Supabase n'est pas configuré.
export function subscribeRealtime(onChange: () => void): (() => void) | undefined {
  if (!supabase) return undefined;

  const channel = supabase
    .channel('akajo-sync')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'planteurs' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pesees' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ventes' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'caisses' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'mouvements_caisse' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'local_accounts' }, onChange)
    .subscribe();

  return () => {
    supabase!.removeChannel(channel);
  };
}
