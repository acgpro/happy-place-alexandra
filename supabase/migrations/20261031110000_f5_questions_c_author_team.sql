-- F5 : direction d'origine de l'auteur, affichée aux managers qui reçoivent la question.
-- Collaborateur : son équipe ; manager : ses équipes (table manager_teams), car sa fiche n'a pas d'équipe.
alter table public.questions add column asked_by_team text;

update public.questions q
set asked_by_team = coalesce(au.team, (select string_agg(mt.team, ', ' order by mt.team)
                                       from public.manager_teams mt where mt.allowed_user_id = au.id))
from public.allowed_users au
where au.email = q.asked_by_email;

create or replace function private.set_question_author()
returns trigger language plpgsql security definer
set search_path = public, private as $$
declare _email text := lower(auth.jwt() ->> 'email');
begin
  new.asked_by_email := _email;
  select coalesce(nullif(btrim(coalesce(au.first_name, '') || ' ' || coalesce(au.last_name, '')), ''), _email),
         coalesce(au.team, (select string_agg(mt.team, ', ' order by mt.team)
                            from public.manager_teams mt where mt.allowed_user_id = au.id))
    into new.asked_by_name, new.asked_by_team
    from public.allowed_users au where au.email = _email;
  new.asked_by_name := coalesce(new.asked_by_name, _email);
  new.status := 'en attente';
  new.asked_at := now();
  new.answer_body := null;
  new.answered_by_email := null;
  new.answered_by_name := null;
  new.answered_by_role := null;
  new.answered_at := null;
  return new;
end $$;
