-- Complément RGPD : à coller dans Supabase → SQL Editor → Run
-- (en plus du schema.sql déjà exécuté)

-- Droit à l'effacement : autoriser chacun à supprimer SES données
create policy "suppression de ses propres donnees"
  on public.donnees_utilisateur for delete
  using (auth.uid() = user_id);

-- Suppression complète du compte par l'utilisateur lui-même.
-- SECURITY DEFINER : la fonction a les droits nécessaires pour supprimer
-- le compte auth, mais ne peut supprimer QUE le compte de l'appelant.
create or replace function public.supprimer_mon_compte()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  delete from public.donnees_utilisateur where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;
