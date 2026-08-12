-- Huilerie Aka.Jo — fusionne aussi les doublons de caisses "secondaire" (une par
-- utilisateur — ex: "gerant"/"bascule1" de démonstration, recréées à chaque
-- installation neuve tant que la synchro ne les reconnaissait pas comme identiques).
-- 0006_dedup_caisses.sql ne couvrait que "principale"/"banque" : reprend aussi ce
-- cas-là au passage, au cas où de nouveaux doublons seraient apparus depuis. Garde
-- la plus ancienne de chaque groupe, réattribue ses mouvements, supprime les autres.
-- Sans effet si aucun doublon — peut être ré-exécuté sans risque.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

-- Nécessaire pour que l'app puisse elle-même nettoyer ces doublons à l'avenir
-- (aucune policy de suppression n'existait sur "caisses" jusqu'ici).
create policy "caisses_delete" on public.caisses
  for delete using (auth.role() = 'authenticated');

do $$
declare
  keep_id uuid;
  t text;
  oi text;
begin
  foreach t in array array['principale', 'banque'] loop
    select id into keep_id from public.caisses where type = t order by created_at asc limit 1;
    if keep_id is not null then
      update public.mouvements_caisse set caisse_from_id = keep_id
        where caisse_from_id in (select id from public.caisses where type = t and id != keep_id);
      update public.mouvements_caisse set caisse_to_id = keep_id
        where caisse_to_id in (select id from public.caisses where type = t and id != keep_id);
      delete from public.caisses where type = t and id != keep_id;
    end if;
  end loop;

  for oi in
    select distinct owner_identifiant from public.caisses
    where type = 'secondaire' and owner_identifiant is not null
  loop
    select id into keep_id from public.caisses
      where type = 'secondaire' and owner_identifiant = oi
      order by created_at asc limit 1;
    if keep_id is not null then
      update public.mouvements_caisse set caisse_from_id = keep_id
        where caisse_from_id in (
          select id from public.caisses where type = 'secondaire' and owner_identifiant = oi and id != keep_id
        );
      update public.mouvements_caisse set caisse_to_id = keep_id
        where caisse_to_id in (
          select id from public.caisses where type = 'secondaire' and owner_identifiant = oi and id != keep_id
        );
      delete from public.caisses where type = 'secondaire' and owner_identifiant = oi and id != keep_id;
    end if;
  end loop;
end $$;
