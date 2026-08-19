import { useSQLiteContext } from 'expo-sqlite';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import {
  createPartenaire,
  deletePartenaire as deletePartenaireRepo,
  listPartenaires,
  tonnageParPlanteur,
  type CreatePartenaireInput,
  type PlanteurTonnage,
} from '../db/repositories/partenaires';
import {
  annulerPesee as annulerPeseeRepo,
  createPesee,
  listPesees,
  togglePayeRegime as togglePayeRegimeRepo,
  togglePayeTransportRegime as togglePayeTransportRegimeRepo,
  type CreatePeseeInput,
} from '../db/repositories/pesees';
import {
  annulerVente as annulerVenteRepo,
  createVente,
  listVentes,
  togglePayeHuile as togglePayeHuileRepo,
  togglePayeTransportVente as togglePayeTransportVenteRepo,
  type CreateVenteInput,
} from '../db/repositories/ventes';
import { getSetting, setSetting } from '../db/repositories/settings';
import {
  allouer as allouerRepo,
  enregistrerApport as enregistrerApportRepo,
  enregistrerPaiementVente,
  enregistrerDepense as enregistrerDepenseRepo,
  enregistrerPaiementPesee,
  enregistrerReglement as enregistrerReglementRepo,
  annulerPaiementVente,
  annulerPaiementPesee,
  ensureCaisseForUser,
  ensureCaissesPourTousLesComptes,
  ensureSingletonCaisses,
  initierRetour as initierRetourRepo,
  initierTransfert as initierTransfertRepo,
  validerMouvement as validerMouvementRepo,
  rejeterMouvement as rejeterMouvementRepo,
  listCaisses,
  listMouvements,
  reparerPaiementsPeseesManquants,
  reparerMouvementsPeseesOrphelins,
  reparerMouvementsVentesOrphelins,
  soldeCaisse,
} from '../db/repositories/caisses';
import { getUserById, listUsers } from '../db/repositories/users';
import type { Caisse, MouvementCaisse, Partenaire, Pesee, Vente } from '../domain/types';
import { supabase } from '../lib/supabase';
import { pullAll } from '../sync/pull';
import {
  pushCaisse,
  pushDeleteMouvementForPesee,
  pushDeleteMouvementForVente,
  pushDeletePartenaire,
  pushMouvement,
  pushMouvementStatus,
  pushPayeRegimeStatus,
  pushPayeTransportPeseeStatus,
  pushPayeHuileStatus,
  pushPayeTransportVenteStatus,
  pushPesee,
  pushPartenaire,
  pushSetting,
  pushUser,
  pushVente,
} from '../sync/push';
import { subscribeRealtime } from '../sync/realtime';

// idsDistants null = le tirage a échoué (hors-ligne ?) : par prudence, ne rien
// repousser plutôt que de risquer d'écraser un changement distant qu'on n'a pas pu
// vérifier.
function jamaisEncoreSynchronises<T extends { id: string }>(locaux: T[], idsDistants: Set<string> | null): T[] {
  if (!idsDistants) return [];
  return locaux.filter((x) => !idsDistants.has(x.id));
}

interface DataContextValue {
  partenaires: Partenaire[];
  pesees: Pesee[];
  ventes: Vente[];
  caisses: Caisse[];
  mouvements: MouvementCaisse[];
  tonnageParPlanteur: Record<string, PlanteurTonnage>;
  prixKg: string;
  prixLitre: string;
  prixTransportRegime: string;
  loading: boolean;
  syncing: boolean;
  refresh: () => Promise<void>;
  synchroniserMaintenant: () => Promise<{ ok: boolean; message: string }>;
  addPartenaire: (input: CreatePartenaireInput) => Promise<Partenaire>;
  supprimerPartenaire: (id: string) => Promise<void>;
  enregistrerPesee: (input: Omit<CreatePeseeInput, 'userId' | 'userNom' | 'chauffeurNom'>) => Promise<Pesee>;
  enregistrerVente: (input: Omit<CreateVenteInput, 'userId' | 'userNom'>) => Promise<Vente>;
  togglePayeRegime: (id: string, paye: boolean) => Promise<void>;
  togglePayeTransportRegime: (id: string, paye: boolean) => Promise<void>;
  togglePayeVenteHuile: (id: string, paye: boolean, caisseId?: string) => Promise<void>;
  togglePayeVenteTransport: (id: string, paye: boolean, caisseId?: string) => Promise<void>;
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
  enregistrerReglement: (input: {
    partenaireId: string;
    volet: 'produit' | 'transport';
    montant: number;
    caisseId: string;
    motif: string;
  }) => Promise<void>;
  validerMouvement: (id: string) => Promise<void>;
  rejeterMouvement: (id: string) => Promise<void>;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const { currentUser } = useAuth();
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
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
      listPartenaires(db),
      listPesees(db),
      listVentes(db),
      tonnageParPlanteur(db),
      getSetting(db, 'prixKg', '115'),
      getSetting(db, 'prixLitre', '950'),
      getSetting(db, 'prixTransportRegime', '10'),
      listCaisses(db),
      listMouvements(db),
    ]);
    setPartenaires(p);
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
  // que le téléphone du Gérant reflète automatiquement les saisies des agents. Les
  // fonctions ci-dessous vivent au niveau du composant (pas dans le useEffect qui les
  // met en route) pour pouvoir aussi être déclenchées à la demande par
  // synchroniserMaintenant() (bouton "Synchroniser") — jusqu'ici seul un redémarrage
  // complet de l'app (ou une connexion) relançait les réparations automatiques.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;
  const cancelledRef = useRef(false);
  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);
  const [syncing, setSyncing] = useState(false);

  // Filet de sécurité hors-ligne uniquement : sans Supabase configuré, fullSync()
  // n'est jamais appelée (voir son premier `if (!supabase) return`) — c'est donc ici
  // qu'on garantit qu'un utilisateur connecté a toujours une caisse locale. Avec
  // Supabase, cette même garantie est assurée dans fullSync(), et UNIQUEMENT là : la
  // lancer aussi ici créerait une course avec le premier tirage (pullCaisses) — sur
  // un appareil qui vient de se connecter, sa caisse existe peut-être déjà côté cloud
  // mais n'a pas encore eu le temps d'être rapatriée localement ; conclure trop tôt
  // qu'elle "n'existe pas" en créerait un doublon.
  useEffect(() => {
    if (supabase) return;
    if (!currentUser) return;
    (async () => {
      await ensureCaisseForUser(db, currentUser.id, currentUser.identifiant);
      await refresh();
    })();
  }, [db, currentUser, refresh]);

  // Rattrape les entités jamais explicitement "créées" par l'utilisateur (caisses/
  // partenaires de démo depuis seedIfEmpty) et toute pesée/vente restée bloquée après
  // un échec d'envoi passé (panne réseau, contrainte serveur temporairement
  // invalide...) qui n'aurait jamais été réessayée autrement. La repousse des comptes
  // (pushUser) n'aboutit que depuis une session gérant (RLS) — depuis un autre rôle,
  // elle échoue silencieusement sans conséquence : seul le gérant fait autorité sur
  // les comptes.
  // IMPORTANT : ne repousse QUE les lignes absentes de Supabase (jamais encore
  // synchronisées) — jamais une ligne qui y existe déjà. pushPesee/pushVente font un
  // upsert de la ligne ENTIÈRE (dernier écrivain gagne) : si cet appareil n'a pas
  // encore tiré un changement fait ailleurs (ex: une pesée marquée payée sur le
  // téléphone du gérant), sa copie locale est en retard sur ce champ précis —
  // repousser quand même sa version entière effacerait ce changement distant plus
  // récent, qui ne reviendrait qu'au prochain tirage, en apparence "annulé après
  // quelques minutes" (le statut payé notamment). Les changements sur une ligne déjà
  // connue de Supabase passent par des mises à jour ciblées ailleurs dans ce fichier
  // (pushPayeRegimeStatus, pushMouvementStatus...), jamais par ici.
  // Un upsert déclenche un événement Realtime même quand la valeur envoyée est
  // identique à celle déjà en base (c'est une commande UPDATE, peu importe si ça
  // change quelque chose) — appeler cette fonction à chaque événement Realtime
  // créerait donc une boucle infinie (chaque repousse déclenchant l'événement qui
  // déclenche la repousse suivante), provoquant un clignotement continu de
  // l'affichage. Elle ne doit donc JAMAIS être appelée par le gestionnaire
  // d'événements Realtime — seulement au démarrage, à la connexion, à intervalle
  // régulier, et par le bouton "Synchroniser".
  const pushPending = useCallback(async () => {
    if (!supabase) return;
    const fetchRemoteIds = async (table: string): Promise<Set<string> | null> => {
      if (!supabase) return null;
      const { data, error } = await supabase.from(table).select('id');
      if (error || !data) return null;
      return new Set(data.map((r: { id: string }) => r.id));
    };
    const [localCaisses, localPartenaires, localPesees, localVentes, localUsers] = await Promise.all([
      listCaisses(db),
      listPartenaires(db),
      listPesees(db),
      listVentes(db),
      listUsers(db),
    ]);
    const [remoteCaisseIds, remotePartenaireIds, remotePeseeIds, remoteVenteIds, remoteUserIds] = await Promise.all([
      fetchRemoteIds('caisses'),
      fetchRemoteIds('planteurs'),
      fetchRemoteIds('pesees'),
      fetchRemoteIds('ventes'),
      fetchRemoteIds('local_accounts'),
    ]);
    await Promise.all([
      ...jamaisEncoreSynchronises(localCaisses, remoteCaisseIds).map((c) => pushCaisse(c).catch(() => {})),
      ...jamaisEncoreSynchronises(localPartenaires, remotePartenaireIds).map((p) => pushPartenaire(p).catch(() => {})),
      ...jamaisEncoreSynchronises(localPesees, remotePeseeIds).map((t) => pushPesee(t).catch(() => {})),
      ...jamaisEncoreSynchronises(localVentes, remoteVenteIds).map((v) => pushVente(v).catch(() => {})),
      ...jamaisEncoreSynchronises(localUsers, remoteUserIds).map((u) => pushUser(u).catch(() => {})),
    ]);
  }, [db]);

  // Ne fait que tirer (jamais d'écriture) — sûr à appeler aussi souvent que Realtime
  // le déclenche, puisque ça ne peut jamais provoquer un nouvel événement. Renvoie si
  // le tirage a réellement eu lieu (voir pullAll) — fullSync s'en sert pour ne jamais
  // fabriquer de caisse sur la foi d'un pull qui n'a rien pu faire.
  const pullAndRefresh = useCallback(async (): Promise<boolean> => {
    const pulled = await pullAll(db);
    if (!cancelledRef.current) await refreshRef.current();
    return pulled;
  }, [db]);

  // Important : la repousse doit se terminer AVANT le pull — sinon un changement
  // local tout juste effectué (ex: pointer une pesée comme payée) mais pas encore
  // arrivé sur Supabase se ferait écraser par la valeur distante encore ancienne que
  // le pull vient de rapatrier, et redeviendrait "impayé" jusqu'au prochain cycle.
  // Renvoie si un tirage complet a bien pu s'exécuter (false = hors-ligne/session
  // absente) — le bouton "Synchroniser" s'en sert pour donner un retour honnête.
  const fullSync = useCallback(async (): Promise<boolean> => {
    if (!supabase) return false;
    await pushPending().catch(() => {});
    const pulled = await pullAndRefresh();
    // Uniquement APRÈS un pull qui a RÉELLEMENT eu lieu (pas juste tenté) : une
    // caisse (la mienne, ou la principale/banque) existant déjà côté cloud vient
    // d'être rapatriée localement si besoin — conclure à une caisse manquante sans
    // certitude que le pull a pu s'exécuter (pas encore de session juste après une
    // connexion, coupure réseau...) en créerait un doublon dans le cloud à chaque
    // fois. C'est exactement ce qui a fait accumuler des dizaines de caisses
    // "banque"/"principale" fantômes en pratique — voir la migration
    // 0019_dedup_caisses_singleton.sql pour le nettoyage déjà effectué.
    if (!pulled) return false;
    await ensureSingletonCaisses(db);
    const user = currentUserRef.current;
    if (user) {
      await ensureCaisseForUser(db, user.id, user.identifiant);
    }
    // Filet de sécurité pour tout AUTRE compte connu localement (pas seulement
    // l'utilisateur courant) qui n'a jamais eu de caisse créée nulle part — voir le
    // commentaire de la fonction. Peut créer des lignes pour des comptes qui ne se
    // sont jamais connectés sur cet appareil, c'est voulu.
    await ensureCaissesPourTousLesComptes(db);
    const localCaissesAfter = await listCaisses(db);
    for (const c of localCaissesAfter) {
      pushCaisse(c).catch(() => {});
    }
    // Filet de sécurité : répare les pesées marquées "payé" dont le mouvement de
    // caisse n'a jamais été créé (séquelle d'un bug déjà corrigé côté toggle, mais
    // qui laisse les pesées déjà touchées bloquées sur "impayé" en Synthèse tant
    // qu'elles n'ont pas été réparées) — désormais que les caisses viennent d'être
    // synchronisées ci-dessus, la résolution a de bien meilleures chances d'aboutir.
    const mouvementsRepares = await reparerPaiementsPeseesManquants(db);
    for (const m of mouvementsRepares) {
      pushMouvement(m).catch(() => {});
    }
    // Filet symétrique : une pesée/vente repassée à "impayé" dont le mouvement existe
    // pourtant encore (suppression réussie en local mais jamais poussée vers
    // Supabase, coupure réseau au moment de l'annulation) — Synthèse la comptait
    // comme payée malgré Historique affichant "impayé".
    const peseesOrphelines = await reparerMouvementsPeseesOrphelins(db);
    for (const { peseeId, volet } of peseesOrphelines) {
      pushDeleteMouvementForPesee(peseeId, volet).catch(() => {});
    }
    const ventesOrphelines = await reparerMouvementsVentesOrphelins(db);
    for (const { venteId, volet } of ventesOrphelines) {
      pushDeleteMouvementForVente(venteId, volet).catch(() => {});
    }
    if (!cancelledRef.current) await refreshRef.current();
    return true;
  }, [db, pushPending, pullAndRefresh]);

  useEffect(() => {
    if (!supabase) return;
    let unsubscribeRealtime: (() => void) | undefined;

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
      unsubscribeRealtime?.();
      authListener.subscription.unsubscribe();
    };
  }, [fullSync, pullAndRefresh, pushPending]);

  // Synchronisation manuelle (bouton "Synchroniser") : relance immédiatement tout le
  // cycle (repousse + tirage + réparations) sans attendre le prochain déclencheur
  // automatique. Renvoie un résultat exploitable directement par l'écran appelant
  // plutôt que d'imposer sa propre UI d'alerte.
  const synchroniserMaintenant = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    if (!supabase) {
      return { ok: false, message: 'Synchronisation cloud non configurée sur cette installation.' };
    }
    setSyncing(true);
    try {
      const ok = await fullSync();
      return ok
        ? { ok: true, message: 'Synchronisation réussie.' }
        : { ok: false, message: "Pas de connexion — vérifiez votre réseau puis réessayez." };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : 'Erreur inconnue.' };
    } finally {
      setSyncing(false);
    }
  }, [fullSync]);

  const addPartenaire = useCallback(
    async (input: CreatePartenaireInput) => {
      const p = await createPartenaire(db, input);
      await refresh();
      pushPartenaire(p).catch(() => {});
      return p;
    },
    [db, refresh]
  );

  const supprimerPartenaire = useCallback(
    async (id: string) => {
      await deletePartenaireRepo(db, id);
      await refresh();
      const r = await pushDeletePartenaire(id).catch((err) => ({ ok: false, error: String(err) }));
      if (!r.ok) {
        Alert.alert('Synchro cloud échouée (suppression partenaire)', r.error ?? 'Erreur inconnue');
      }
    },
    [db, refresh]
  );

  const enregistrerPesee = useCallback(
    async (input: Omit<CreatePeseeInput, 'userId' | 'userNom' | 'chauffeurNom'>) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const chauffeurNom = partenaires.find((p) => p.id === input.chauffeurId)?.nom ?? '';
      const t = await createPesee(db, { ...input, chauffeurNom, userId: currentUser.id, userNom: currentUser.nom });
      await refresh();
      // Pousse d'abord le planteur et le chauffeur référencés (au cas où l'un des deux
      // ne l'aurait jamais été, ex: partenaires de démo créés au premier lancement) :
      // sinon la pesée viole une clé étrangère côté Supabase et échoue silencieusement.
      const planteur = partenaires.find((p) => p.id === input.planteurId);
      const chauffeur = partenaires.find((p) => p.id === input.chauffeurId);
      (async () => {
        for (const partenaire of [planteur, chauffeur]) {
          if (!partenaire) continue;
          const rp = await pushPartenaire(partenaire).catch((err) => ({ ok: false, error: String(err) }));
          if (!rp.ok) {
            Alert.alert('Synchro cloud échouée (partenaire)', rp.error ?? 'Erreur inconnue');
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
    [db, refresh, currentUser, partenaires]
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

  // Résout la caisse de l'agent qui a enregistré la pesée — d'abord dans la liste déjà
  // en mémoire, sinon en resynchronisant une fois avant d'abandonner. Sans ce filet,
  // une caisse pas encore visible localement (créée/synchronisée depuis un autre
  // appareil) faisait échouer silencieusement la création du mouvement de caisse tout
  // en laissant passer le statut "payé" : Historique (qui lit juste le drapeau)
  // affichait payé, Synthèse (qui recalcule depuis les mouvements réels) restait
  // impayée indéfiniment.
  //
  // Recherche par IDENTIFIANT (via caisse.ownerIdentifiant), jamais par userId local :
  // le lien caisse.userId n'est renseigné que si l'appareil courant avait déjà ce
  // compte dans sa table users AU MOMENT PRÉCIS où cette caisse a été tirée depuis
  // Supabase (pullCaisses résout owner_identifiant → userId local à cet instant-là,
  // COALESCE ne le corrige jamais après coup si ça a raté une fois). Un agent
  // fraîchement créé, ou juste réparé par ensureCaissesPourTousLesComptes, se
  // retrouvait donc introuvable indéfiniment même après une resynchronisation
  // réussie — alors que la caisse existait bel et bien, correctement identifiée par
  // son owner_identifiant.
  const resoudreCaisseCreateur = useCallback(
    async (createdBy: string): Promise<Caisse | undefined> => {
      const parIdentifiant = async (): Promise<Caisse | undefined> => {
        const createur = await getUserById(db, createdBy);
        if (!createur) return undefined;
        const identifiant = createur.identifiant.trim().toLowerCase();
        const toutes = await listCaisses(db);
        return toutes.find((c) => c.ownerIdentifiant?.trim().toLowerCase() === identifiant);
      };

      const locale = caisses.find((c) => c.userId === createdBy) ?? (await parIdentifiant());
      if (locale) return locale;
      await pullAll(db).catch(() => {});
      return parIdentifiant();
    },
    [db, caisses]
  );

  const togglePayeRegime = useCallback(
    async (id: string, paye: boolean) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const pesee = pesees.find((p) => p.id === id);

      if (paye && pesee) {
        const caisse = await resoudreCaisseCreateur(pesee.createdBy);
        if (!caisse) {
          Alert.alert(
            'Paiement non enregistré',
            "Impossible de retrouver la caisse de l'agent qui a enregistré cette pesée sur cet appareil. Vérifiez la connexion puis réessayez."
          );
          return;
        }
        await togglePayeRegimeRepo(db, id, true, { userId: currentUser.id, userNom: currentUser.nom });
        const mouvement = await enregistrerPaiementPesee(db, {
          caisseId: caisse.id,
          peseeId: id,
          volet: 'produit',
          montant: pesee.montant,
          actor: { userId: currentUser.id, userNom: currentUser.nom },
        });
        if (mouvement) pushMouvement(mouvement).catch(() => {});
      } else {
        await togglePayeRegimeRepo(db, id, paye, { userId: currentUser.id, userNom: currentUser.nom });
        await annulerPaiementPesee(db, id, 'produit');
        pushDeleteMouvementForPesee(id, 'produit').catch(() => {});
      }
      await refresh();
      const r = await pushPayeRegimeStatus(id, paye).catch((err) => ({ ok: false, error: String(err) }));
      if (!r.ok) {
        Alert.alert('Synchro cloud échouée (statut paiement régime)', r.error ?? 'Erreur inconnue');
      }
    },
    [db, refresh, currentUser, pesees, resoudreCaisseCreateur]
  );

  const togglePayeTransportRegime = useCallback(
    async (id: string, paye: boolean) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const pesee = pesees.find((p) => p.id === id);

      if (paye && pesee) {
        const caisse = await resoudreCaisseCreateur(pesee.createdBy);
        if (!caisse) {
          Alert.alert(
            'Paiement non enregistré',
            "Impossible de retrouver la caisse de l'agent qui a enregistré cette pesée sur cet appareil. Vérifiez la connexion puis réessayez."
          );
          return;
        }
        await togglePayeTransportRegimeRepo(db, id, true, { userId: currentUser.id, userNom: currentUser.nom });
        const mouvement = await enregistrerPaiementPesee(db, {
          caisseId: caisse.id,
          peseeId: id,
          volet: 'transport',
          montant: pesee.montantTransport,
          actor: { userId: currentUser.id, userNom: currentUser.nom },
        });
        if (mouvement) pushMouvement(mouvement).catch(() => {});
      } else {
        await togglePayeTransportRegimeRepo(db, id, paye, { userId: currentUser.id, userNom: currentUser.nom });
        await annulerPaiementPesee(db, id, 'transport');
        pushDeleteMouvementForPesee(id, 'transport').catch(() => {});
      }
      await refresh();
      const r = await pushPayeTransportPeseeStatus(id, paye).catch((err) => ({ ok: false, error: String(err) }));
      if (!r.ok) {
        Alert.alert('Synchro cloud échouée (statut paiement transport)', r.error ?? 'Erreur inconnue');
      }
    },
    [db, refresh, currentUser, pesees, resoudreCaisseCreateur]
  );

  const togglePayeVenteHuile = useCallback(
    async (id: string, paye: boolean, caisseId?: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      await togglePayeHuileRepo(db, id, paye, { userId: currentUser.id, userNom: currentUser.nom });
      // Le volet "huile" payé crédite la caisse choisie par le vendeur (recette) ;
      // indépendant du transport, qui est une dépense (voir togglePayeVenteTransport).
      const vente = ventes.find((v) => v.id === id);
      if (paye) {
        if (!caisseId) throw new Error('Caisse destinataire requise');
        if (vente) {
          const mouvement = await enregistrerPaiementVente(db, {
            caisseId,
            venteId: id,
            volet: 'produit',
            montant: vente.montant,
            actor: { userId: currentUser.id, userNom: currentUser.nom },
          });
          if (mouvement) pushMouvement(mouvement).catch(() => {});
        }
      } else {
        await annulerPaiementVente(db, id, 'produit');
        pushDeleteMouvementForVente(id, 'produit').catch(() => {});
      }
      await refresh();
      const r = await pushPayeHuileStatus(id, paye).catch((err) => ({ ok: false, error: String(err) }));
      if (!r.ok) {
        Alert.alert('Synchro cloud échouée (statut paiement huile)', r.error ?? 'Erreur inconnue');
      }
    },
    [db, refresh, currentUser, ventes]
  );

  const togglePayeVenteTransport = useCallback(
    async (id: string, paye: boolean, caisseId?: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      await togglePayeTransportVenteRepo(db, id, paye, { userId: currentUser.id, userNom: currentUser.nom });
      // Le volet "transport" payé débite la caisse choisie (c'est une dépense — voir
      // "prix de revient" dans l'écran Vente) ; indépendant du volet huile.
      const vente = ventes.find((v) => v.id === id);
      if (paye) {
        if (!caisseId) throw new Error('Caisse à débiter requise');
        if (vente) {
          const mouvement = await enregistrerPaiementVente(db, {
            caisseId,
            venteId: id,
            volet: 'transport',
            montant: vente.montantTransport,
            actor: { userId: currentUser.id, userNom: currentUser.nom },
          });
          if (mouvement) pushMouvement(mouvement).catch(() => {});
        }
      } else {
        await annulerPaiementVente(db, id, 'transport');
        pushDeleteMouvementForVente(id, 'transport').catch(() => {});
      }
      await refresh();
      const r = await pushPayeTransportVenteStatus(id, paye).catch((err) => ({ ok: false, error: String(err) }));
      if (!r.ok) {
        Alert.alert('Synchro cloud échouée (statut paiement transport)', r.error ?? 'Erreur inconnue');
      }
    },
    [db, refresh, currentUser, ventes]
  );

  const annulerPesee = useCallback(
    async (id: string, motif: string) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      await annulerPeseeRepo(db, id, motif, { userId: currentUser.id, userNom: currentUser.nom });
      await annulerPaiementPesee(db, id, 'produit');
      await annulerPaiementPesee(db, id, 'transport');
      const pesee = pesees.find((p) => p.id === id);
      await refresh();
      pushDeleteMouvementForPesee(id, 'produit').catch(() => {});
      pushDeleteMouvementForPesee(id, 'transport').catch(() => {});
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
      await annulerPaiementVente(db, id, 'produit');
      await annulerPaiementVente(db, id, 'transport');
      const vente = ventes.find((v) => v.id === id);
      await refresh();
      pushDeleteMouvementForVente(id, 'produit').catch(() => {});
      pushDeleteMouvementForVente(id, 'transport').catch(() => {});
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

  const enregistrerReglement = useCallback(
    async (input: { partenaireId: string; volet: 'produit' | 'transport'; montant: number; caisseId: string; motif: string }) => {
      if (!currentUser) throw new Error('Utilisateur non connecté');
      const m = await enregistrerReglementRepo(db, {
        caisseId: input.caisseId,
        partenaireId: input.partenaireId,
        volet: input.volet,
        montant: input.montant,
        motif: input.motif,
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
      partenaires,
      pesees,
      ventes,
      caisses,
      mouvements,
      tonnageParPlanteur: tonnage,
      prixKg,
      prixLitre,
      prixTransportRegime,
      loading,
      syncing,
      refresh,
      synchroniserMaintenant,
      addPartenaire,
      supprimerPartenaire,
      enregistrerPesee,
      enregistrerVente,
      togglePayeRegime,
      togglePayeTransportRegime,
      togglePayeVenteHuile,
      togglePayeVenteTransport,
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
      enregistrerReglement,
      validerMouvement,
      rejeterMouvement,
    }),
    [
      partenaires,
      pesees,
      ventes,
      caisses,
      mouvements,
      tonnage,
      prixKg,
      prixLitre,
      prixTransportRegime,
      loading,
      syncing,
      refresh,
      synchroniserMaintenant,
      addPartenaire,
      supprimerPartenaire,
      enregistrerPesee,
      enregistrerVente,
      togglePayeRegime,
      togglePayeTransportRegime,
      togglePayeVenteHuile,
      togglePayeVenteTransport,
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
      enregistrerReglement,
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
