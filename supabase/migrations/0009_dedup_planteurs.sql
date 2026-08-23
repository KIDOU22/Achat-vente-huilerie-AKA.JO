-- Huilerie Aka.Jo — fusionne les planteurs en double (créés séparément par
-- différentes installations avant que la synchro ne fonctionne). Garde le plus
-- ancien de chaque groupe (même nom/village/tel), réattribue ses pesées, supprime
-- les autres. Sans effet si aucun doublon — peut être ré-exécuté sans risque.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

do $$
declare
  g record;
  keep_id uuid;
begin
  for g in
    select lower(trim(nom)) as nom_key, village, tel
    from public.planteurs
    group by lower(trim(nom)), village, tel
    having count(*) > 1
  loop
    select id into keep_id
    from public.planteurs
    where lower(trim(nom)) = g.nom_key and village = g.village and tel = g.tel
    order by created_at asc
    limit 1;

    update public.pesees set planteur_id = keep_id
      where planteur_id in (
        select id from public.planteurs
        where lower(trim(nom)) = g.nom_key and village = g.village and tel = g.tel and id != keep_id
      );

    delete from public.planteurs
      where lower(trim(nom)) = g.nom_key and village = g.village and tel = g.tel and id != keep_id;
  end loop;
end $$;
