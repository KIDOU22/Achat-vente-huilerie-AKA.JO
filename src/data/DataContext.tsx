import { useSQLiteContext } from 'expo-sqlite';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createPlanteur, listPlanteurs, tonnageParPlanteur, type PlanteurTonnage } from '../db/repositories/planteurs';
import { createPesee, listPesees, togglePaye as togglePayeRepo, type CreatePeseeInput } from '../db/repositories/pesees';
import { createVente, listVentes, type CreateVenteInput } from '../db/repositories/ventes';
import { getSetting, setSetting } from '../db/repositories/settings';
import type { Pesee, Planteur, Vente } from '../domain/types';
import { supabase } from '../lib/supabase';
import { pullAll } from '../sync/pull';
import { pushPayeStatus, pushPesee, pushPlanteur, pushSetting, pushVente } from '../sync/push';
import { subscribeRealtime } from '../sync/realtime';

interface DataContextValue {
  planteurs: Planteur[];
  pesees: Pesee[];
  ventes: Vente[];
  tonnageParPlanteur: Record<string, PlanteurTonnage>;
  prixKg: string;
  prixLitre: string;
  prixTransportRegime: string;
  loading: boolean;
  refresh: () => Promise<void>;
  addPlanteur: (input: { nom: string; village: string; tel: string }) => Promise<Planteur>;
  enregistrerPesee: (input: Omit<CreatePeseeInput, 'userId' | 'userNom'>) => Promise<Pesee>;
  enregistrerVente: (input: Omit<CreateVenteInput, 'userId' | 'userNom'>) => Promise<Vente>;
  togglePaye: (id: string, paye: boolean) => Promise<void>;
  setPrixKg: (value: string) => Promise<void>;
  setPrixLitre: (value: string) => Promise<void>;
  setPrixTransportRegime: (value: string) => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const { currentUser } = useAuth();
  const [planteurs, setPlanteurs] = useState<Planteur[]>([]);
  const [pesees, setPesees] = useState<Pesee[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [tonnage, setTonnage] = useState<Record<string, PlanteurTonnage>>({});
  const [prixKg, setPrixKgState] = useState('115');
  const [prixLitre, setPrixLitreState] = useState('950');
  const [prixTransportRegime, setPrixTransportRegimeState] = useState('10');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [p, a, v, t, pk, pl, ptr] = await Promise.all([
      listPlanteurs(db),
      listPesees(db),
      listVentes(db),
      tonnageParPlanteur(db),
      getSetting(db, 'prixKg', '115'),
      getSetting(db, 'prixLitre', '950'),
      getSetting(db, 'prixTransportRegime', '10'),
    ]);
    setPlanteurs(p);
    setPesees(a);
    setVentes(v);
    setTonnage(t);
    setPrixKgState(pk);
    setPrixLitreState(pl);
    setPrixTransportRegimeState(ptr);
  }, [db]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // Synchronisation cloud : tire les données distantes au démarrage et à chaque
  // connexion, puis reste à l'écoute des changements en temps réel (Realtime) pour
  // que le téléphone du Gérant reflète automatiquement les saisies des agents.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    let unsubscribeRealtime: (() => void) | undefined;

    async function syncNow() {
      await pullAll(db);
      if (!cancelled) await refreshRef.current();
    }

    syncNow();
    unsubscribeRealtime = subscribeRealtime(() => {
      syncNow();
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') syncNow();
    });

    return () => {
      cancelled = true;
      unsubscribeRealtime?.();
      authListener.subscription.unsubscribe();
    };
  }, [db]);

  const addPlanteur = useCallback(
    async (input: { nom: string; village: string; tel: string }) => {
      const p = await createPlanteur(db, input);
      await refresh();
      pushPlanteur(p).catch(() => {});
      return p;
    },
    [db, refresh]
  );

  const enregistrerPesee = useCallback(
    async (input: Omit<CreatePeseeInput, 'userId' | 'userNom'>) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const t = await createPesee(db, { ...input, userId: currentUser.id, userNom: currentUser.nom });
      await refresh();
      pushPesee(t).catch(() => {});
      return t;
    },
    [db, refresh, currentUser]
  );

  const enregistrerVente = useCallback(
    async (input: Omit<CreateVenteInput, 'userId' | 'userNom'>) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const t = await createVente(db, { ...input, userId: currentUser.id, userNom: currentUser.nom });
      await refresh();
      pushVente(t).catch(() => {});
      return t;
    },
    [db, refresh, currentUser]
  );

  const togglePaye = useCallback(
    async (id: string, paye: boolean) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      await togglePayeRepo(db, id, paye, { userId: currentUser.id, userNom: currentUser.nom });
      await refresh();
      pushPayeStatus(id, paye).catch(() => {});
    },
    [db, refresh, currentUser]
  );

  const setPrixKg = useCallback(
    async (value: string) => {
      await setSetting(db, 'prixKg', value);
      setPrixKgState(value);
      pushSetting('prixKg', value).catch(() => {});
    },
    [db]
  );

  const setPrixLitre = useCallback(
    async (value: string) => {
      await setSetting(db, 'prixLitre', value);
      setPrixLitreState(value);
      pushSetting('prixLitre', value).catch(() => {});
    },
    [db]
  );

  const setPrixTransportRegime = useCallback(
    async (value: string) => {
      await setSetting(db, 'prixTransportRegime', value);
      setPrixTransportRegimeState(value);
      pushSetting('prixTransportRegime', value).catch(() => {});
    },
    [db]
  );

  const value = useMemo<DataContextValue>(
    () => ({
      planteurs,
      pesees,
      ventes,
      tonnageParPlanteur: tonnage,
      prixKg,
      prixLitre,
      prixTransportRegime,
      loading,
      refresh,
      addPlanteur,
      enregistrerPesee,
      enregistrerVente,
      togglePaye,
      setPrixKg,
      setPrixLitre,
      setPrixTransportRegime,
    }),
    [
      planteurs,
      pesees,
      ventes,
      tonnage,
      prixKg,
      prixLitre,
      prixTransportRegime,
      loading,
      refresh,
      addPlanteur,
      enregistrerPesee,
      enregistrerVente,
      togglePaye,
      setPrixKg,
      setPrixLitre,
      setPrixTransportRegime,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useAppData doit être utilisé dans un <DataProvider>');
  return ctx;
}
