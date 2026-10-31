-- F5 : poser une question à une direction (Could). Critères : CA-F5-1 à 12 (User stories v2, section 4).
-- Décisions : les 3 rôles posent une question ; direction = équipe de `teams` avec au moins un autre manager que l'auteur ;
-- les managers de la direction répondent, la première réponse clôt la question ; un manager ne répond pas à sa propre question ;
-- l'admin lit seulement les questions en attente ; l'auteur supprime tant que la question est en attente ; aucune notification.

create table public.questions (
  id                uuid primary key default gen_random_uuid(),
  team              text not null references public.teams(name) on update cascade on delete restrict
                      check (lower(btrim(team)) <> 'admin'),
  body              text not null check (char_length(btrim(body)) between 1 and 500),
  status            text not null default 'en attente' check (status in ('en attente', 'répondue')),
  asked_by_email    text not null,
  asked_by_name     text not null,
  asked_at          timestamptz not null default now(),
  answer_body       text check (answer_body is null or char_length(btrim(answer_body)) between 1 and 500),
  answered_by_email text,
  answered_by_name  text,
  answered_by_role  public.app_role,
  answered_at       timestamptz,
  constraint questions_answer_coherent check (
    (status = 'en attente' and answer_body is null and answered_by_email is null and answered_at is null)
    or (status = 'répondue' and answer_body is not null and answered_by_email is not null and answered_at is not null)
  )
);
comment on table public.questions is
  'F5 : question posée par un utilisateur à une direction (équipe). Réponse écrite uniquement par public.answer_question().';

create index questions_team_status_idx on public.questions (team, status);
create index questions_asked_by_idx on public.questions (asked_by_email);

-- Le manager de la direction (rôle manager rattaché à l'équipe). Ne retient pas l'admin, contrairement à can_review_team.
create or replace function private.is_manager_of_team(_team text)
returns boolean language sql stable security definer
set search_path = public, private as $$
  select exists (
    select 1
    from public.allowed_users au
    join public.allowed_user_roles aur on aur.allowed_user_id = au.id
    join public.manager_teams mt on mt.allowed_user_id = au.id
    where au.email = lower(auth.jwt() ->> 'email')
      and aur.role = 'manager'
      and lower(mt.team) = lower(_team)
  )
$$;

-- Direction ouverte à la question : au moins un manager autre que l'auteur, hors équipe « Admin » (CA-F5-3).
create or replace function private.can_ask_team(_team text)
returns boolean language sql stable security definer
set search_path = public, private as $$
  select lower(btrim(_team)) <> 'admin'
    and exists (
      select 1
      from public.manager_teams mt
      join public.allowed_users m on m.id = mt.allowed_user_id
      join public.allowed_user_roles r on r.allowed_user_id = m.id
      where lower(mt.team) = lower(_team)
        and r.role = 'manager'
        and m.email <> lower(auth.jwt() ->> 'email')
    )
$$;

-- Liste des directions proposées dans la fenêtre « Poser une question ».
create or replace function public.askable_teams()
returns setof text language sql stable security definer
set search_path = public, private as $$
  select t.name
  from public.teams t
  where private.is_allowed() and private.can_ask_team(t.name)
  order by t.name
$$;

-- À l'insertion : auteur, statut et date posés par la base, jamais par le client.
create or replace function private.set_question_author()
returns trigger language plpgsql security definer
set search_path = public, private as $$
declare _email text := lower(auth.jwt() ->> 'email');
begin
  new.asked_by_email := _email;
  select coalesce(nullif(btrim(coalesce(au.first_name, '') || ' ' || coalesce(au.last_name, '')), ''), _email)
    into new.asked_by_name
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

create trigger set_question_author
  before insert on public.questions
  for each row execute function private.set_question_author();

-- Réponse atomique : verrou sur la ligne, la première réponse gagne (CA-F5-6 à 8).
create or replace function public.answer_question(_question_id uuid, _body text)
returns public.questions language plpgsql security definer
set search_path = public, private as $$
declare
  _email text := lower(auth.jwt() ->> 'email');
  _q public.questions;
  _name text;
begin
  if not private.is_allowed() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into _q from public.questions where id = _question_id for update;
  if not found then
    raise exception 'Question introuvable' using errcode = 'P0002';
  end if;
  if not private.is_manager_of_team(_q.team) then
    raise exception 'Réponse réservée aux managers de la direction' using errcode = '42501';
  end if;
  if _q.asked_by_email = _email then
    raise exception 'Un manager ne répond pas à sa propre question' using errcode = '42501';
  end if;
  if _q.status <> 'en attente' then
    raise exception 'Question déjà répondue' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(_body, ''))) not between 1 and 500 then
    raise exception 'La réponse doit faire de 1 à 500 caractères' using errcode = '22023';
  end if;
  select coalesce(nullif(btrim(coalesce(au.first_name, '') || ' ' || coalesce(au.last_name, '')), ''), _email)
    into _name from public.allowed_users au where au.email = _email;
  update public.questions
     set status = 'répondue',
         answer_body = btrim(_body),
         answered_by_email = _email,
         answered_by_name = coalesce(_name, _email),
         answered_by_role = private.current_app_role(),
         answered_at = now()
   where id = _question_id
   returning * into _q;
  return _q;
end $$;

alter table public.questions enable row level security;
revoke all on public.questions from public, anon, authenticated;
grant select, insert, delete on public.questions to authenticated;
revoke execute on function
  private.is_manager_of_team(text), private.can_ask_team(text), private.set_question_author(),
  public.askable_teams(), public.answer_question(uuid, text)
  from public, anon;
grant execute on function
  private.is_manager_of_team(text), private.can_ask_team(text),
  public.askable_teams(), public.answer_question(uuid, text)
  to authenticated;

-- Lecture : l'auteur, les managers de la direction, l'admin (questions en attente seulement) (CA-F5-5, CA-F5-11).
create policy "Read questions" on public.questions
for select to authenticated using (
  private.is_allowed() and (
    asked_by_email = lower(auth.jwt() ->> 'email')
    or private.is_manager_of_team(team)
    or (private.is_admin() and status = 'en attente')
  )
);

-- Création : les 3 rôles, vers une direction ouverte (CA-F5-1, CA-F5-3).
create policy "Ask question" on public.questions
for insert to authenticated with check (
  private.is_allowed() and private.can_ask_team(team)
);

-- Suppression : l'auteur, tant que la question est en attente (CA-F5-10). Aucune politique de modification : la réponse passe par answer_question().
create policy "Author deletes pending question" on public.questions
for delete to authenticated using (
  asked_by_email = lower(auth.jwt() ->> 'email') and status = 'en attente'
);
