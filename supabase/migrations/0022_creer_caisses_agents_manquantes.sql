-- Huilerie Aka.Jo — crée directement côté cloud la caisse "secondaire" manquante de
-- chaque compte actif. Une caisse ne dépend que de owner_identifiant, pas d'une
-- session cloud fonctionnelle pour son propriétaire — jusqu'ici sa création reposait
-- sur ensureCaisseForUser(), qui ne s'exécute qu'après le premier tirage RÉUSSI de
-- l'appareil de CET utilisateur (voir DataContext.fullSync). Plusieurs agents n'ayant
-- jamais eu de session cloud qui fonctionne (même cause que Donald/Sandra au début du
-- pilote) n'ont donc jamais eu de caisse créée nulle part : impossible pour QUI QUE CE
-- SOIT de marquer un de leurs paiements (la caisse à débiter n'existe pas), quel que
-- soit l'appareil. Répare tous les comptes concernés en une fois, sans dépendre de la
-- réparation individuelle de chaque session. Idempotent — sans effet si déjà présente.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

insert into public.caisses (id, type, owner_identifiant, created_at)
select gen_random_uuid(), 'secondaire', lower(trim(la.identifiant)), now()
from public.local_accounts la
where la.actif = true
  and not exists (
    select 1 from public.caisses c
    where c.type = 'secondaire' and lower(trim(c.owner_identifiant)) = lower(trim(la.identifiant))
  );
