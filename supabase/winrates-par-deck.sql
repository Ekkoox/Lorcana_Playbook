-- Statistiques par deck — à coller dans Supabase → SQL Editor → Run
-- (complément de winrates.sql, déjà exécuté)

-- Identifiant du deck Duels.ink auquel se rapporte la ligne.
-- '*' = toutes listes confondues pour cette bicolorité (sert de repli
-- quand un deck précis n'a pas assez de parties sur un matchup).
alter table public.meta_winrates
  add column if not exists deck_ref text not null default '*';

-- La contrainte d'unicité doit désormais inclure le deck
alter table public.meta_winrates
  drop constraint if exists meta_winrates_unique;

alter table public.meta_winrates
  add constraint meta_winrates_unique
  unique nulls not distinct (source, user_id, deck_encres, deck_ref, adversaire_encres, sur_le_play);


-- Decks joués sur Duels.ink, repérés dans l'historique de parties.
-- Sert à proposer l'import d'un deck et à le lier à un deck Loremasters.
create table if not exists public.duelsink_decks (
  user_id uuid not null references auth.users (id) on delete cascade,
  deck_id text not null,
  nom text,
  encres text,
  parties integer not null default 0,
  derniere_partie timestamptz,
  decklist jsonb,
  maj_le timestamptz not null default now(),
  primary key (user_id, deck_id)
);

alter table public.duelsink_decks enable row level security;

create policy "lecture de ses propres decks duelsink"
  on public.duelsink_decks for select
  to authenticated
  using (auth.uid() = user_id);

-- Écriture réservée aux fonctions serveur (clé service_role).
