-- Comptes Duels.ink des joueurs — à coller dans Supabase → SQL Editor → Run
--
-- Chaque joueur connecte SON propre compte Duels.ink en collant un jeton
-- d'API (lecture seule) créé depuis https://duels.ink/account.
--
-- Sécurité : le jeton n'est JAMAIS lisible depuis le navigateur. Aucune policy
-- de lecture n'est accordée sur la table ; seules les fonctions serveur
-- (clé service_role) y accèdent. Les joueurs passent par trois fonctions
-- dédiées : connecter, déconnecter, consulter le statut.

create table if not exists public.duelsink_comptes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  jeton text not null,
  derniere_synchro timestamptz,
  derniere_erreur text,
  maj_le timestamptz not null default now()
);

alter table public.duelsink_comptes enable row level security;
-- Volontairement aucune policy : la table est inaccessible aux clients.


-- Connecter son compte : enregistre ou remplace son jeton.
create or replace function public.connecter_duelsink(jeton_brut text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  -- Un jeton Duels.ink est une chaîne hexadécimale de 96 caractères
  if jeton_brut !~ '^[0-9a-fA-F]{96}$' then
    raise exception 'Jeton invalide : attendu 96 caractères hexadécimaux';
  end if;

  insert into public.duelsink_comptes (user_id, jeton, maj_le)
  values (auth.uid(), jeton_brut, now())
  on conflict (user_id) do update
    set jeton = excluded.jeton,
        derniere_erreur = null,
        maj_le = now();
end;
$$;

-- Déconnecter son compte : supprime le jeton ET les statistiques personnelles
create or replace function public.deconnecter_duelsink()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  delete from public.duelsink_comptes where user_id = auth.uid();
  delete from public.meta_winrates where source = 'duelsink_perso' and user_id = auth.uid();
  delete from public.duelsink_decks where user_id = auth.uid();
  delete from public.duelsink_sync where user_id = auth.uid();
end;
$$;

-- Statut de son compte, sans jamais renvoyer le jeton
create or replace function public.statut_duelsink()
returns json
language sql
security definer
set search_path = ''
as $$
  select json_build_object(
    'connecte', count(*) > 0,
    'derniere_synchro', max(derniere_synchro),
    'derniere_erreur', max(derniere_erreur)
  )
  from public.duelsink_comptes
  where user_id = auth.uid();
$$;

revoke execute on function public.connecter_duelsink(text) from public, anon;
revoke execute on function public.deconnecter_duelsink() from public, anon;
revoke execute on function public.statut_duelsink() from public, anon;
grant execute on function public.connecter_duelsink(text) to authenticated;
grant execute on function public.deconnecter_duelsink() to authenticated;
grant execute on function public.statut_duelsink() to authenticated;
