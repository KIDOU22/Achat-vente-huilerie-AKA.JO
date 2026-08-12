-- Huilerie Aka.Jo — le dirigeant peut désormais VOIR les prix (huile, graine,
-- transport) mais ne doit plus pouvoir les MODIFIER : seul le gérant reste
-- autorisé à écrire dans "settings". La lecture (settings_select) reste
-- ouverte au dirigeant via is_elevated(), inchangée depuis 0007_dirigeant.sql.
-- À exécuter : Dashboard > SQL Editor > New query > coller > Run

drop policy if exists "settings_insert" on public.settings;
create policy "settings_insert" on public.settings
  for insert with check (public.is_gerant());

drop policy if exists "settings_update" on public.settings;
create policy "settings_update" on public.settings
  for update using (public.is_gerant());
