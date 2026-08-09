import { useSQLiteContext } from 'expo-sqlite';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { createPlanteur, listPlanteurs, tonnageParPlanteur, type PlanteurTonnage } from '../db/repositories/planteurs';
import { createPesee, listPesees, togglePaye as togglePayeRepo, type CreatePeseeInput } from '../db/repositories/pesees';
import { createVente, listVentes, type CreateVenteInput } from '../db/repositories/ventes';
import { getSetting, setSetting } from '../db/repositories/settings';
import type { Pesee, Planteur, Vente } from '../domain/types';

interface DataContextValue {
  planteurs: Planteur[];
  pesees: Pesee[];
  ventes: Vente[];
  tonnageParPlanteur: Record<string, PlanteurTonnage>;
  prixKg: string;
  prixLitre: string;
  prixTransportRegime: string;
  prixTransportHuile: string;
  loading: boolean;
  refresh: () => Promise<void>;
  addPlanteur: (input: { nom: string; village: string; tel: string }) => Promise<Planteur>;
  enregistrerPesee: (input: Omit<CreatePeseeInput, 'userId' | 'userNom'>) => Promise<Pesee>;
  enregistrerVente: (input: Omit<CreateVenteInput, 'userId' | 'userNom'>) => Promise<Vente>;
  togglePaye: (id: string, paye: boolean) => Promise<void>;
  setPrixKg: (value: string) => Promise<void>;
  setPrixLitre: (value: string) => Promise<void>;
  setPrixTransportRegime: (value: string) => Promise<void>;
  setPrixTransportHuile: (value: string) => Promise<void>;
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
  const [prixTransportHuile, setPrixTransportHuileState] = useState('10');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [p, a, v, t, pk, pl, ptr, pth] = await Promise.all([
      listPlanteurs(db),
      listPesees(db),
      listVentes(db),
      tonnageParPlanteur(db),
      getSetting(db, 'prixKg', '115'),
      getSetting(db, 'prixLitre', '950'),
      getSetting(db, 'prixTransportRegime', '10'),
      getSetting(db, 'prixTransportHuile', '10'),
    ]);
    setPlanteurs(p);
    setPesees(a);
    setVentes(v);
    setTonnage(t);
    setPrixKgState(pk);
    setPrixLitreState(pl);
    setPrixTransportRegimeState(ptr);
    setPrixTransportHuileState(pth);
  }, [db]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const addPlanteur = useCallback(
    async (input: { nom: string; village: string; tel: string }) => {
      const p = await createPlanteur(db, input);
      await refresh();
      return p;
    },
    [db, refresh]
  );

  const enregistrerPesee = useCallback(
    async (input: Omit<CreatePeseeInput, 'userId' | 'userNom'>) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const t = await createPesee(db, { ...input, userId: currentUser.id, userNom: currentUser.nom });
      await refresh();
      return t;
    },
    [db, refresh, currentUser]
  );

  const enregistrerVente = useCallback(
    async (input: Omit<CreateVenteInput, 'userId' | 'userNom'>) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const t = await createVente(db, { ...input, userId: currentUser.id, userNom: currentUser.nom });
      await refresh();
      return t;
    },
    [db, refresh, currentUser]
  );

  const togglePaye = useCallback(
    async (id: string, paye: boolean) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      await togglePayeRepo(db, id, paye, { userId: currentUser.id, userNom: currentUser.nom });
      await refresh();
    },
    [db, refresh, currentUser]
  );

  const setPrixKg = useCallback(
    async (value: string) => {
      await setSetting(db, 'prixKg', value);
      setPrixKgState(value);
    },
    [db]
  );

  const setPrixLitre = useCallback(
    async (value: string) => {
      await setSetting(db, 'prixLitre', value);
      setPrixLitreState(value);
    },
    [db]
  );

  const setPrixTransportRegime = useCallback(
    async (value: string) => {
      await setSetting(db, 'prixTransportRegime', value);
      setPrixTransportRegimeState(value);
    },
    [db]
  );

  const setPrixTransportHuile = useCallback(
    async (value: string) => {
      await setSetting(db, 'prixTransportHuile', value);
      setPrixTransportHuileState(value);
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
      prixTransportHuile,
      loading,
      refresh,
      addPlanteur,
      enregistrerPesee,
      enregistrerVente,
      togglePaye,
      setPrixKg,
      setPrixLitre,
      setPrixTransportRegime,
      setPrixTransportHuile,
    }),
    [
      planteurs,
      pesees,
      ventes,
      tonnage,
      prixKg,
      prixLitre,
      prixTransportRegime,
      prixTransportHuile,
      loading,
      refresh,
      addPlanteur,
      enregistrerPesee,
      enregistrerVente,
      togglePaye,
      setPrixKg,
      setPrixLitre,
      setPrixTransportRegime,
      setPrixTransportHuile,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useAppData doit être utilisé dans un <DataProvider>');
  return ctx;
}
