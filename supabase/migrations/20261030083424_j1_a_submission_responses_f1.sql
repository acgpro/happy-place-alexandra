create type public.response_visibility as enum ('auteur', 'entreprise');

create table public.submission_responses (
  submission_id      uuid primary key references public.submissions(id) on delete cascade,
  body               text not null check (char_length(btrim(body)) between 1 and 500),
  visibility         public.response_visibility not null default 'auteur',
  responded_by_email text not null,
  responded_by_name  text not null,
  responded_by_role  public.app_role not null,
  responded_at       timestamptz not null default now()
);
comment on table public.submission_responses is
  'F1 : réponse du valideur à l''auteur d''une idée. Lecture selon la visibilité choisie.';

create or replace function private.can_validate_submission(_submission_id uuid)
returns boolean language sql stable security definer
set search_path = public, private as $$
  select exists (
    select 1
    from public.submissions s
    left join public.allowed_users au on au.email = s.submitted_by_email
    left join public.allowed_user_roles aur on aur.allowed_user_id = au.id
    where s.id = _submission_id
      and s.submitted_by_email is distinct from lower(auth.jwt() ->> 'email')
      and (
        (private.current_app_role() = 'manager'
          and coalesce(aur.role, 'collaborateur') = 'collaborateur'
          and exists (select 1 from public.manager_teams mt
                      join public.allowed_users m on m.id = mt.allowed_user_id
                      where m.email = lower(auth.jwt() ->> 'email')
                        and lower(mt.team) = lower(s.team)))
        or (private.is_admin() and aur.role in ('manager', 'admin'))
      )
  )
$$;

create or replace function private.set_response_author()
returns trigger language plpgsql security definer
set search_path = public, private as $$
declare _email text := lower(auth.jwt() ->> 'email');
begin
  if tg_op = 'UPDATE' and new.submission_id <> old.submission_id then
    raise exception 'La réponse ne peut pas changer d''idée';
  end if;
  new.responded_by_email := _email;
  select coalesce(nullif(btrim(coalesce(au.first_name,'') || ' ' || coalesce(au.last_name,'')), ''), _email)
    into new.responded_by_name
    from public.allowed_users au where au.email = _email;
  new.responded_by_role := private.current_app_role();
  new.responded_at := now();
  return new;
end $$;

create trigger set_response_author
  before insert or update on public.submission_responses
  for each row execute function private.set_response_author();

alter table public.submission_responses enable row level security;
revoke all on public.submission_responses from public, anon;
grant select, insert, update on public.submission_responses to authenticated;
revoke execute on function private.can_validate_submission(uuid), private.set_response_author() from public, anon;
grant execute on function private.can_validate_submission(uuid) to authenticated;

create policy "Read responses" on public.submission_responses
for select to authenticated using (
  private.is_allowed() and (
    private.is_admin()
    or responded_by_email = lower(auth.jwt() ->> 'email')
    or exists (select 1 from public.submissions s
               where s.id = submission_responses.submission_id
                 and s.submitted_by_email = lower(auth.jwt() ->> 'email'))
    or (private.current_app_role() = 'manager' and exists (
          select 1 from public.submissions s
          where s.id = submission_responses.submission_id and private.can_review_team(s.team)))
    or (visibility = 'entreprise' and exists (
          select 1 from public.submissions s
          where s.id = submission_responses.submission_id and s.status = 'validée'))
  )
);

create policy "Validator writes response" on public.submission_responses
for insert to authenticated with check (
  private.can_validate_submission(submission_responses.submission_id)
  and exists (select 1 from public.submissions s
              where s.id = submission_responses.submission_id and s.status = 'en attente')
);

create policy "Validator edits pending response" on public.submission_responses
for update to authenticated
using (private.can_validate_submission(submission_id)
       and exists (select 1 from public.submissions s where s.id = submission_id and s.status = 'en attente'))
with check (private.can_validate_submission(submission_id));
