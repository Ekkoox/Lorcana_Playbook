-- Statistiques de matchup — à coller dans Supabase → SQL Editor → Run
--
-- Une seule table pour toutes les sources de win rate :
--   source = 'duelsink_perso' : tes propres parties (user_id renseigné)
--   source = 'duelsink_meta'  : la matrice communautaire (user_id NULL)
--   source = 'inkdecks'       : idem, si autorisation obtenue plus tard
-- L'affichage du site lit cette table sans savoir d'où viennent les chiffres :
-- brancher une source globale ne demandera aucune modification du front.

create table if not exists public.meta_winrates (
  id bigint generated always as identity primary key,
  source text not null,
  -- NULL = donnée globale (visible par tous) ; sinon, données privées d'un joueur
  user_id uuid references auth.users (id) on delete cascade,
  -- Bicolorité sous forme canonique triée, ex. 'Amber/Steel'. '*' = toutes.
  deck_encres text not null default '*',
  adversaire_encres text not null,
  -- true = on commence, false = on est second, NULL = les deux confondus
  sur_le_play boolean,
  victoires integer not null default 0,
  defaites integer not null default 0,
  parties integer not null default 0,
  maj_le timestamptz not null default now(),
  constraint meta_winrates_unique
    unique nulls not distinct (source, user_id, deck_encres, adversaire_encres, sur_le_play)
);

create index if not exists meta_winrates_lookup
  on public.meta_winrates (source, user_id, deck_encres);

alter table public.meta_winrates enable row level security;

-- Lecture : ses propres stats, plus les données globales (user_id NULL)
create policy "lecture de ses stats et des stats globales"
  on public.meta_winrates for select
  to authenticated
  using (user_id is null or auth.uid() = user_id);

-- Aucune policy d'écriture : seules les fonctions serveur (clé service_role,
-- qui contourne le RLS) alimentent cette table. Les joueurs ne peuvent rien y écrire.


-- Suivi des imports, pour n'aller chercher que les parties nouvelles
create table if not exists public.duelsink_sync (
  user_id uuid primary key references auth.users (id) on delete cascade,
  dernier_import timestamptz,
  derniere_partie timestamptz,
  parties_importees integer not null default 0,
  maj_le timestamptz not null default now()
);

alter table public.duelsink_sync enable row level security;

create policy "lecture de son propre suivi"
  on public.duelsink_sync for select
  to authenticated
  using (auth.uid() = user_id);
