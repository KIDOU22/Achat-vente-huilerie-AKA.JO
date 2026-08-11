import { useSQLiteContext } from 'expo-sqlite';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { createPlanteur, listPlanteurs, tonnageParPlanteur, type PlanteurTonnage } from '../db/repositories/planteurs';
import {
  annulerPesee as annulerPeseeRepo,
  createPesee,
  listPesees,
  togglePaye as togglePayeRepo,
  type CreatePeseeInput,
} from '../db/repositories/pesees';
import { annulerVente as annulerVenteRepo, createVente, listVentes, type CreateVenteInput } from '../db/repositories/ventes';
import { getSetting, setSetting } from '../db/repositories/settings';
import {
  allouer as allouerRepo,
  enregistrerApport as enregistrerApportRepo,
  enregistrerDepense as enregistrerDepenseRepo,
  enregistrerDepensePesee,
  annulerDepensePesee,
  initierRetour as initierRetourRepo,
  initierTransfert as initierTransfertRepo,
  validerMouvement as validerMouvementRepo,
  rejeterMouvement as rejeterMouvementRepo,
  listCaisses,
  listMouvements,
  soldeCaisse,
} from '../db/repositories/caisses';
import type { Caisse, MouvementCaisse, Pesee, Planteur, Vente } from '../domain/types';
import { supabase } from '../lib/supabase';
import { pullAll } from '../sync/pull';
import {
  pushCaisse,
  pushDeleteMouvementForPesee,
  pushMouvement,
  pushMouvementStatus,
  pushPayeStatus,
  pushPesee,
  pushPlanteur,
  pushSetting,
  pushVente,
} from '../sync/push';
import { subscribeRealtime } from '../sync/realtime';

interface DataContextValue {
  planteurs: Planteur[];
  pesees: Pesee[];
  ventes: Vente[];
  caisses: Caisse[];
  mouvements: MouvementCaisse[];
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
  annulerPesee: (id: string, motif: string) => Promise<void>;
  annulerVente: (id: string, motif: string) => Promise<void>;
  setPrixKg: (value: string) => Promise<void>;
  setPrixLitre: (value: string) => Promise<void>;
  setPrixTransportRegime: (value: string) => Promise<void>;
  soldeCaisse: (caisseId: string) => number;
  enregistrerApport: (caisseId: string, montant: number, motif: string) => Promise<void>;
  allouerCaisse: (toCaisseId: string, montant: number, motif: string) => Promise<void>;
  enregistrerDepense: (caisseId: string, montant: number, motif: string) => Promise<void>;
  initierRetour: (caisseId: string, montant: number, motif: string) => Promise<void>;
  initierTransfert: (fromCaisseId: string, toCaisseId: string, montant: number, motif: string) => Promise<void>;
  validerMouvement: (id: string) => Promise<void>;
  rejeterMouvement: (id: string) => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const { currentUser } = useAuth();
  const [planteurs, setPlanteurs] = useState<Planteur[]>([]);
  const [pesees, setPesees] = useState<Pesee[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [caisses, setCaisses] = useState<Caisse[]>([]);
  const [mouvements, setMouvements] = useState<MouvementCaisse[]>([]);
  const [tonnage, setTonnage] = useState<Record<string, PlanteurTonnage>>({});
  const [prixKg, setPrixKgState] = useState('115');
  const [prixLitre, setPrixLitreState] = useState('950');
  const [prixTransportRegime, setPrixTransportRegimeState] = useState('10');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [p, a, v, t, pk, pl, ptr, c, m] = await Promise.all([
      listPlanteurs(db),
      listPesees(db),
      listVentes(db),
      tonnageParPlanteur(db),
      getSetting(db, 'prixKg', '115'),
      getSetting(db, 'prixLitre', '950'),
      getSetting(db, 'prixTransportRegime', '10'),
      listCaisses(db),
      listMouvements(db),
    ]);
    setPlanteurs(p);
    setPesees(a);
    setVentes(v);
    setTonnage(t);
    setPrixKgState(pk);
    setPrixLitreState(pl);
    setPrixTransportRegimeState(ptr);
    setCaisses(c);
    setMouvements(m);
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
      // Repousse systématiquement tout ce qui existe localement — upsert idempotent,
      // sans risque à répéter. Rattrape à la fois les entités jamais explicitement
      // "créées" par l'utilisateur (caisses/planteurs de démo depuis seedIfEmpty) et
      // toute pesée/vente restée bloquée après un échec d'envoi passé (panne réseau,
      // contrainte serveur temporairement invalide...) qui n'aurait jamais été
      // réessayée autrement.
      const [localCaisses, localPlanteurs, localPesees, localVentes] = await Promise.all([
        listCaisses(db),
        listPlanteurs(db),
        listPesees(db),
        listVentes(db),
      ]);
      for (const c of localCaisses) {
        pushCaisse(c).catch(() => {});
      }
      for (const p of localPlanteurs) {
        pushPlanteur(p).catch(() => {});
      }
      for (const t of localPesees) {
        pushPesee(t).catch(() => {});
      }
      for (const v of localVentes) {
        pushVente(v).catch(() => {});
      }
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
      // Pousse d'abord le planteur référencé (au cas où il ne l'aurait jamais été,
      // ex: planteurs de démo créés au premier lancement) : sinon la pesée viole la
      // clé étrangère côté Supabase et échoue silencieusement.
      const planteur = planteurs.find((p) => p.id === input.planteurId);
      (async () => {
        if (planteur) {
          const rp = await pushPlanteur(planteur).catch((err) => ({ ok: false, error: String(err) }));
          if (!rp.ok) {
            Alert.alert('Synchro cloud échouée (planteur)', rp.error ?? 'Erreur inconnue');
            return;
          }
        }
        const rt = await pushPesee(t).catch((err) => ({ ok: false, error: String(err) }));
        if (!rt.ok) {
          Alert.alert('Synchro cloud échouée (pesée)', rt.error ?? 'Erreur inconnue');
        }
      })();
      return t;
    },
    [db, refresh, currentUser, planteurs]
  );

  const enregistrerVente = useCallback(
    async (input: Omit<CreateVenteInput, 'userId' | 'userNom'>) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const t = await createVente(db, { ...input, userId: currentUser.id, userNom: currentUser.nom });
      await refresh();
      pushVente(t)
        .then((r) => {
          if (!r.ok) Alert.alert('Synchro cloud échouée (vente)', r.error ?? 'Erreur inconnue');
        })
        .catch(() => {});
      return t;
    },
    [db, refresh, currentUser]
  );

  const togglePaye = useCallback(
    async (id: string, paye: boolean) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      await togglePayeRepo(db, id, paye, { userId: currentUser.id, userNom: currentUser.nom });
      // Une pesée payée débite automatiquement la caisse de l'agent qui l'a réglée ;
      // repasser à "impayée" annule cette dépense automatique.
      const pesee = pesees.find((p) => p.id === id);
      const caisse = pesee ? caisses.find((c) => c.userId === pesee.createdBy) : undefined;
      if (pesee && caisse) {
        if (paye) {
          const mouvement = await enregistrerDepensePesee(db, {
            caisseId: caisse.id,
            peseeId: id,
            montant: pesee.montant,
            actor: { userId: currentUser.id, userNom: currentUser.nom },
          });
          if (mouvement) pushMouvement(mouvement).catch(() => {});
        } else {
          await annulerDepensePesee(db, id);
          pushDeleteMouvementForPesee(id).catch(() => {});
        }
      }
      await refresh();
      pushPayeStatus(id, paye).catch(() => {});
    },
    [db, refresh, currentUser, pesees, caisses]
  );

  const annulerPesee = useCallback(
    async (id: string, motif: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      await annulerPeseeRepo(db, id, motif, { userId: currentUser.id, userNom: currentUser.nom });
      await annulerDepensePesee(db, id);
      const pesee = pesees.find((p) => p.id === id);
      await refresh();
      pushDeleteMouvementForPesee(id).catch(() => {});
      if (pesee) {
        pushPesee({ ...pesee, annulee: true, annuleePar: currentUser.id, motifAnnulation: motif.trim() }).catch(() => {});
      }
    },
    [db, refresh, currentUser, pesees]
  );

  const annulerVente = useCallback(
    async (id: string, motif: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      await annulerVenteRepo(db, id, motif, { userId: currentUser.id, userNom: currentUser.nom });
      const vente = ventes.find((v) => v.id === id);
      await refresh();
      if (vente) {
        pushVente({ ...vente, annulee: true, annuleePar: currentUser.id, motifAnnulation: motif.trim() }).catch(() => {});
      }
    },
    [db, refresh, currentUser, ventes]
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

  const soldeCaisseFn = useCallback((caisseId: string) => soldeCaisse(caisseId, mouvements), [mouvements]);

  const enregistrerApport = useCallback(
    async (caisseId: string, montant: number, motif: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const m = await enregistrerApportRepo(db, { caisseId, montant, motif, actor: { userId: currentUser.id, userNom: currentUser.nom } });
      await refresh();
      pushMouvement(m).catch(() => {});
    },
    [db, refresh, currentUser]
  );

  const allouerCaisse = useCallback(
    async (toCaisseId: string, montant: number, motif: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const m = await allouerRepo(db, { toCaisseId, montant, motif, actor: { userId: currentUser.id, userNom: currentUser.nom } });
      await refresh();
      pushMouvement(m).catch(() => {});
    },
    [db, refresh, currentUser]
  );

  const enregistrerDepense = useCallback(
    async (caisseId: string, montant: number, motif: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const m = await enregistrerDepenseRepo(db, { caisseId, montant, motif, actor: { userId: currentUser.id, userNom: currentUser.nom } });
      await refresh();
      pushMouvement(m).catch(() => {});
    },
    [db, refresh, currentUser]
  );

  const initierRetour = useCallback(
    async (caisseId: string, montant: number, motif: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const m = await initierRetourRepo(db, { caisseId, montant, motif, actor: { userId: currentUser.id, userNom: currentUser.nom } });
      await refresh();
      pushMouvement(m).catch(() => {});
    },
    [db, refresh, currentUser]
  );

  const initierTransfert = useCallback(
    async (fromCaisseId: string, toCaisseId: string, montant: number, motif: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const m = await initierTransfertRepo(db, {
        fromCaisseId,
        toCaisseId,
        montant,
        motif,
        actor: { userId: currentUser.id, userNom: currentUser.nom },
      });
      await refresh();
      pushMouvement(m).catch(() => {});
    },
    [db, refresh, currentUser]
  );

  const validerMouvement = useCallback(
    async (id: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const ts = Date.now();
      await validerMouvementRepo(db, id, { userId: currentUser.id, userNom: currentUser.nom });
      await refresh();
      pushMouvementStatus(id, 'validee', currentUser.id, currentUser.nom, ts).catch(() => {});
    },
    [db, refresh, currentUser]
  );

  const rejeterMouvement = useCallback(
    async (id: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const ts = Date.now();
      await rejeterMouvementRepo(db, id, { userId: currentUser.id, userNom: currentUser.nom });
      await refresh();
      pushMouvementStatus(id, 'rejetee', currentUser.id, currentUser.nom, ts).catch(() => {});
    },
    [db, refresh, currentUser]
  );

  const value = useMemo<DataContextValue>(
    () => ({
      planteurs,
      pesees,
      ventes,
      caisses,
      mouvements,
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
      annulerPesee,
      annulerVente,
      setPrixKg,
      setPrixLitre,
      setPrixTransportRegime,
      soldeCaisse: soldeCaisseFn,
      enregistrerApport,
      allouerCaisse,
      enregistrerDepense,
      initierRetour,
      initierTransfert,
      validerMouvement,
      rejeterMouvement,
    }),
    [
      planteurs,
      pesees,
      ventes,
      caisses,
      mouvements,
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
      annulerPesee,
      annulerVente,
      setPrixKg,
      setPrixLitre,
      setPrixTransportRegime,
      soldeCaisseFn,
      enregistrerApport,
      allouerCaisse,
      enregistrerDepense,
      initierRetour,
      initierTransfert,
      validerMouvement,
      rejeterMouvement,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useAppData doit être utilisé dans un <DataProvider>');
  return ctx;
}
