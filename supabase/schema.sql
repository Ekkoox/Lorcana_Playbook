-- Schéma Loremasters : à coller tel quel dans Supabase → SQL Editor → Run
-- Une ligne par utilisateur : ses decks et ses stratégies en JSON,
-- exactement le même format que le localStorage actuel du site.

create table if not exists public.donnees_utilisateur (
  user_id uuid primary key references auth.users (id) on delete cascade,
  decks jsonb not null default '[]'::jsonb,
  strategies jsonb not null default '{}'::jsonb,
  maj_le timestamptz not null default now()
);

-- Sécurité : chaque membre ne peut lire et modifier QUE ses propres données
alter table public.donnees_utilisateur enable row level security;

create policy "lecture de ses propres donnees"
  on public.donnees_utilisateur for select
  using (auth.uid() = user_id);

create policy "creation de ses propres donnees"
  on public.donnees_utilisateur for insert
  with check (auth.uid() = user_id);

create policy "modification de ses propres donnees"
  on public.donnees_utilisateur for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
