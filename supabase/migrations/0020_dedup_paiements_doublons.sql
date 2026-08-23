-- Huilerie Aka.Jo — corrige un double paiement : reparerPaiementsPeseesManquants()
-- (ajoutée pour réparer les pesées marquées "payé" sans mouvement de caisse) pouvait
-- tourner sur deux appareils avant que l'un ne voie la création de l'autre — chacun
-- vérifiait localement/à distance "ce mouvement existe-t-il déjà ?" au même instant,
-- répondait non, et créait chacun le sien : deux mouvements de "depense" pour la même
-- pesée et le même volet (ex: 681 860 F payés deux fois pour une seule pesée de Nou
-- Adama, 1 363 720 F au total). Aucune contrainte ne l'empêchait côté base.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

-- 1) Nettoyage des doublons déjà créés : garde le plus ancien de chaque groupe
--    (pesee_id, volet) ou (vente_id, volet), supprime les autres.
delete from public.mouvements_caisse a
using public.mouvements_caisse b
where a.pesee_id is not null and a.volet is not null
  and a.pesee_id = b.pesee_id and a.volet = b.volet
  and (a.ts > b.ts or (a.ts = b.ts and a.id > b.id));

delete from public.mouvements_caisse a
using public.mouvements_caisse b
where a.vente_id is not null and a.volet is not null
  and a.vente_id = b.vente_id and a.volet = b.volet
  and (a.ts > b.ts or (a.ts = b.ts and a.id > b.id));

-- 2) Garde-fou définitif : au plus un mouvement par pesée/vente et par volet, quel
--    que soit le nombre d'appareils qui tentent de le créer en même temps.
create unique index if not exists idx_mouvements_pesee_volet_unique
  on public.mouvements_caisse (pesee_id, volet)
  where pesee_id is not null and volet is not null;

create unique index if not exists idx_mouvements_vente_volet_unique
  on public.mouvements_caisse (vente_id, volet)
  where vente_id is not null and volet is not null;
