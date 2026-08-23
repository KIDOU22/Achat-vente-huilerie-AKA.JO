-- Huilerie Aka.Jo — Module Finance & Comptabilité, Phase 1 (Trésorerie & Budget).
-- Registre séparé de caisses/mouvements_caisse (dédié au paiement des
-- achats/ventes) — voir le plan de développement pour la justification.
-- Lecture réservée à Gérant + Dirigeant (is_elevated()) ; écriture réservée
-- au Gérant (is_gerant()) pour cette Phase 1.
-- À exécuter après 0022_creer_caisses_agents_manquantes.sql :
-- Dashboard > SQL Editor > New query > coller > Run

create table public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('recette', 'depense')),
  libelle text not null,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.finance_categories enable row level security;

create policy "finance_categories_select" on public.finance_categories
  for select using (public.is_elevated());
create policy "finance_categories_insert" on public.finance_categories
  for insert with check (public.is_gerant());
create policy "finance_categories_update" on public.finance_categories
  for update using (public.is_gerant());

create table public.finance_budgets (
  id uuid primary key default gen_random_uuid(),
  annee integer not null unique,
  solde_ouverture numeric not null,
  date_ouverture timestamptz not null,
  created_by text not null,
  created_at timestamptz not null default now()
);
alter table public.finance_budgets enable row level security;

create policy "finance_budgets_select" on public.finance_budgets
  for select using (public.is_elevated());
create policy "finance_budgets_insert" on public.finance_budgets
  for insert with check (public.is_gerant());
create policy "finance_budgets_update" on public.finance_budgets
  for update using (public.is_gerant());

create table public.finance_budget_lignes (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.finance_budgets(id) on delete cascade,
  categorie_id uuid not null references public.finance_categories(id),
  mois integer not null check (mois between 1 and 12),
  montant_prevu numeric not null default 0,
  unique (budget_id, categorie_id, mois)
);
alter table public.finance_budget_lignes enable row level security;

create policy "finance_budget_lignes_select" on public.finance_budget_lignes
  for select using (public.is_elevated());
create policy "finance_budget_lignes_insert" on public.finance_budget_lignes
  for insert with check (public.is_gerant());
create policy "finance_budget_lignes_update" on public.finance_budget_lignes
  for update using (public.is_gerant());

create table public.finance_mouvements (
  id uuid primary key default gen_random_uuid(),
  ts timestamptz not null default now(),
  num_piece text not null default '',
  libelle text not null,
  categorie_id uuid not null references public.finance_categories(id),
  mode_paiement text not null check (mode_paiement in ('banque', 'caisse', 'mobile_money', 'autre')),
  entree numeric not null default 0,
  sortie numeric not null default 0,
  created_by text not null,
  created_by_nom text not null,
  created_at timestamptz not null default now()
);
create index idx_finance_mouvements_ts on public.finance_mouvements(ts desc);
alter table public.finance_mouvements enable row level security;

create policy "finance_mouvements_select" on public.finance_mouvements
  for select using (public.is_elevated());
create policy "finance_mouvements_insert" on public.finance_mouvements
  for insert with check (public.is_gerant());
create policy "finance_mouvements_update" on public.finance_mouvements
  for update using (public.is_gerant());
create policy "finance_mouvements_delete" on public.finance_mouvements
  for delete using (public.is_gerant());

alter publication supabase_realtime add table public.finance_categories;
alter publication supabase_realtime add table public.finance_budgets;
alter publication supabase_realtime add table public.finance_budget_lignes;
alter publication supabase_realtime add table public.finance_mouvements;

-- Catégories par défaut (§3.1b du cahier des charges), reprises telles quelles.
-- Paramétrables ensuite par le Gérant (ajout/renommage/désactivation).
insert into public.finance_categories (type, libelle) values
  ('recette', 'Vente huile de palme (CPO)'),
  ('recette', 'Vente palmiste'),
  ('recette', 'Vente tourteaux, noix et sous-produits'),
  ('recette', 'Autres recettes (apports, subventions)'),
  ('depense', 'Achat régimes de palme (matière première)'),
  ('depense', 'Main d''œuvre / salaires'),
  ('depense', 'Carburant pour production'),
  ('depense', 'Carburant pour déplacement'),
  ('depense', 'Carburant pour usine'),
  ('depense', 'Électricité usine'),
  ('depense', 'Électricité pour logement'),
  ('depense', 'Entretien et pièces de rechange'),
  ('depense', 'Transport et logistique'),
  ('depense', 'Emballages et fournitures'),
  ('depense', 'Charges administratives'),
  ('depense', 'Taxes et impôts'),
  ('depense', 'Investissements et équipements'),
  ('depense', 'Autres dépenses');
