import { useSQLiteContext } from 'expo-sqlite';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { createPlanteur, deletePlanteur as deletePlanteurRepo, listPlanteurs, tonnageParPlanteur, type PlanteurTonnage } from '../db/repositories/planteurs';
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
  ensureCaisseForUser,
  ensureSingletonCaisses,
  initierRetour as initierRetourRepo,
  initierTransfert as initierTransfertRepo,
  validerMouvement as validerMouvementRepo,
  rejeterMouvement as rejeterMouvementRepo,
  listCaisses,
  listMouvements,
  soldeCaisse,
} from '../db/repositories/caisses';
import { listUsers } from '../db/repositories/users';
import type { Caisse, MouvementCaisse, Pesee, Planteur, Vente } from '../domain/types';
import { supabase } from '../lib/supabase';
import { pullAll } from '../sync/pull';
import {
  pushCaisse,
  pushDeleteMouvementForPesee,
  pushDeletePlanteur,
  pushMouvement,
  pushMouvementStatus,
  pushPayeStatus,
  pushPesee,
  pushPlanteur,
  pushSetting,
  pushUser,
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
  supprimerPlanteur: (id: string) => Promise<void>;
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
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  // Filet de sécurité hors-ligne uniquement : sans Supabase configuré, l'effet de
  // synchro ci-dessous ne s'exécute jamais (voir son premier `if (!supabase) return`)
  // — c'est donc ici qu'on garantit qu'un utilisateur connecté a toujours une caisse
  // locale. Avec Supabase, cette même garantie est assurée dans fullSync() ci-dessous,
  // et UNIQUEMENT là : la lancer aussi ici créerait une course avec le premier tirage
  // (pullCaisses) — sur un appareil qui vient de se connecter, sa caisse existe peut-
  // être déjà côté cloud mais n'a pas encore eu le temps d'être rapatriée localement ;
  // conclure trop tôt qu'elle "n'existe pas" en créerait un doublon.
  useEffect(() => {
    if (supabase) return;
    if (!currentUser) return;
    (async () => {
      await ensureCaisseForUser(db, currentUser.id, currentUser.identifiant);
      await refresh();
    })();
  }, [db, currentUser, refresh]);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    let unsubscribeRealtime: (() => void) | undefined;

    // Repousse systématiquement tout ce qui existe localement — upsert idempotent,
    // sans risque à répéter. Rattrape à la fois les entités jamais explicitement
    // "créées" par l'utilisateur (caisses/planteurs de démo depuis seedIfEmpty) et
    // toute pesée/vente restée bloquée après un échec d'envoi passé (panne réseau,
    // contrainte serveur temporairement invalide...) qui n'aurait jamais été
    // réessayée autrement. La repousse des comptes (pushUser) n'aboutit que depuis
    // une session gérant (RLS) — depuis un autre rôle, elle échoue silencieusement
    // sans conséquence : seul le gérant fait autorité sur les comptes.
    // IMPORTANT : un upsert déclenche un événement Realtime même quand la valeur
    // envoyée est identique à celle déjà en base (c'est une commande UPDATE, peu
    // importe si elle change quelque chose) — appeler cette fonction à chaque
    // événement Realtime créerait donc une boucle infinie (chaque repousse
    // déclenchant l'événement qui déclenche la repousse suivante), provoquant un
    // clignotement continu de l'affichage. Elle ne doit donc JAMAIS être appelée par
    // le gestionnaire d'événements Realtime ci-dessous — seulement au démarrage, à la
    // connexion, et à intervalle régulier.
    async function pushPending() {
      const [localCaisses, localPlanteurs, localPesees, localVentes, localUsers] = await Promise.all([
        listCaisses(db),
        listPlanteurs(db),
        listPesees(db),
        listVentes(db),
        listUsers(db),
      ]);
      await Promise.all([
        ...localCaisses.map((c) => pushCaisse(c).catch(() => {})),
        ...localPlanteurs.map((p) => pushPlanteur(p).catch(() => {})),
        ...localPesees.map((t) => pushPesee(t).catch(() => {})),
        ...localVentes.map((v) => pushVente(v).catch(() => {})),
        ...localUsers.map((u) => pushUser(u).catch(() => {})),
      ]);
    }

    // Ne fait que tirer (jamais d'écriture) — sûr à appeler aussi souvent que
    // Realtime le déclenche, puisque ça ne peut jamais provoquer un nouvel événement.
    async function pullAndRefresh() {
      await pullAll(db);
      if (!cancelled) await refreshRef.current();
    }

    // Important : la repousse doit se terminer AVANT le pull — sinon un changement
    // local tout juste effectué (ex: pointer une pesée comme payée) mais pas encore
    // arrivé sur Supabase se ferait écraser par la valeur distante encore ancienne
    // que le pull vient de rapatrier, et redeviendrait "impayé" jusqu'au prochain
    // cycle.
    async function fullSync() {
      await pushPending().catch(() => {});
      await pullAndRefresh();
      // Uniquement APRÈS le pull : une caisse (la mienne, ou la principale/banque)
      // existant déjà côté cloud vient d'être rapatriée localement à l'instant si
      // besoin — conclure à une caisse manquante avant d'avoir laissé cette chance au
      // pull créerait un doublon à chaque appareil vidé/réinstallé.
      await ensureSingletonCaisses(db);
      const user = currentUserRef.current;
      if (user) {
        await ensureCaisseForUser(db, user.id, user.identifiant);
      }
      const localCaissesAfter = await listCaisses(db);
      for (const c of localCaissesAfter) {
        pushCaisse(c).catch(() => {});
      }
      if (!cancelled) await refreshRef.current();
    }

    fullSync();
    unsubscribeRealtime = subscribeRealtime(() => {
      pullAndRefresh();
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') fullSync();
    });

    // Filet de sécurité périodique (pas déclenché par Realtime, donc sans risque de
    // boucle) pour rattraper les échecs d'envoi qui n'auraient jamais provoqué
    // d'événement Realtime chez les autres appareils (ex: appareil resté hors-ligne).
    const pushInterval = setInterval(() => {
      pushPending().catch(() => {});
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(pushInterval);
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

  const supprimerPlanteur = useCallback(
    async (id: string) => {
      await deletePlanteurRepo(db, id);
      await refresh();
      const r = await pushDeletePlanteur(id).catch((err) => ({ ok: false, error: String(err) }));
      if (!r.ok) {
        Alert.alert('Synchro cloud échouée (suppression planteur)', r.error ?? 'Erreur inconnue');
      }
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
            // Le paiement couvre le régime ET le transport — les deux sortent de la
            // même caisse au moment où la pesée est marquée payée.
            montant: pesee.montant + pesee.montantTransport,
            actor: { userId: currentUser.id, userNom: currentUser.nom },
          });
          if (mouvement) pushMouvement(mouvement).catch(() => {});
        } else {
          await annulerDepensePesee(db, id);
          pushDeleteMouvementForPesee(id).catch(() => {});
        }
      }
      await refresh();
      const r = await pushPayeStatus(id, paye).catch((err) => ({ ok: false, error: String(err) }));
      if (!r.ok) {
        Alert.alert('Synchro cloud échouée (statut paiement)', r.error ?? 'Erreur inconnue');
      }
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
      supprimerPlanteur,
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
      supprimerPlanteur,
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
