-- Huilerie Aka.Jo — reprend la fusion des caisses "secondaire" en ignorant la casse
-- et les espaces sur owner_identifiant. 0012_dedup_caisses_secondaires.sql groupait
-- par correspondance exacte : un même identifiant enregistré avec une casse
-- différente selon l'appareil (ex: "Borgia" vs "borgia") n'était alors jamais
-- reconnu comme doublon. Sans effet si aucun doublon — peut être ré-exécuté sans
-- risque.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

do $$
declare
  keep_id uuid;
  oi text;
begin
  for oi in
    select distinct lower(trim(owner_identifiant)) from public.caisses
    where type = 'secondaire' and owner_identifiant is not null
  loop
    select id into keep_id from public.caisses
      where type = 'secondaire' and lower(trim(owner_identifiant)) = oi
      order by created_at asc limit 1;
    if keep_id is not null then
      update public.mouvements_caisse set caisse_from_id = keep_id
        where caisse_from_id in (
          select id from public.caisses where type = 'secondaire' and lower(trim(owner_identifiant)) = oi and id != keep_id
        );
      update public.mouvements_caisse set caisse_to_id = keep_id
        where caisse_to_id in (
          select id from public.caisses where type = 'secondaire' and lower(trim(owner_identifiant)) = oi and id != keep_id
        );
      delete from public.caisses where type = 'secondaire' and lower(trim(owner_identifiant)) = oi and id != keep_id;
    end if;
  end loop;

  -- Normalise ce qui reste, pour que toute future comparaison exacte (ex: le tirage
  -- côté app, qui recherche l'utilisateur local par identifiant en minuscules) reste
  -- cohérente.
  update public.caisses set owner_identifiant = lower(trim(owner_identifiant))
    where owner_identifiant is not null and owner_identifiant != lower(trim(owner_identifiant));
end $$;
