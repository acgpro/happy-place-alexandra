drop policy "Admins manage submissions" on public.submissions;
drop policy "Managers review assigned submissions" on public.submissions;

create policy "Admins delete submissions" on public.submissions
  for delete to authenticated using (private.is_admin());

create policy "Reviewers update submissions" on public.submissions
  for update to authenticated
  using (private.is_admin() or private.can_validate_submission(id))
  with check (private.is_admin() or private.can_validate_submission(id));

create or replace function private.enforce_submission_review()
returns trigger language plpgsql security definer
set search_path = public, private as $fn$
declare _role public.app_role := private.current_app_role();
begin
  if pg_trigger_depth() > 1 or _role is null or _role not in ('manager','admin') then
    return new;
  end if;
  if new.author_name is distinct from old.author_name
     or new.team is distinct from old.team
     or new.content is distinct from old.content
     or new.created_at is distinct from old.created_at
     or new.submitted_by_email is distinct from old.submitted_by_email then
    raise exception 'Le contenu et l''auteur d''une idée ne sont pas modifiables';
  end if;
  if new.attachment_path is distinct from old.attachment_path
     or new.attachment_name is distinct from old.attachment_name then
    if _role <> 'admin' or new.attachment_path is not null then
      raise exception 'Seul un admin peut retirer la pièce jointe';
    end if;
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'en attente' or new.status not in ('validée','refusée') then
      raise exception 'Seule une idée en attente peut être validée ou refusée';
    end if;
    if not private.can_validate_submission(old.id) then
      raise exception 'Vous ne pouvez pas valider ou refuser cette idée';
    end if;
    if new.status = 'validée'
       and not exists (select 1 from public.submission_responses where submission_id = old.id) then
      raise exception 'Une réponse à l''auteur est obligatoire pour valider une idée';
    end if;
    if new.status = 'refusée'
       and (new.rejection_category is null or nullif(btrim(coalesce(new.rejection_note,'')),'') is null) then
      raise exception 'Un motif et une raison sont obligatoires pour refuser une idée';
    end if;
  elsif new.rejection_category is distinct from old.rejection_category
     or new.rejection_note is distinct from old.rejection_note then
    raise exception 'Le motif de refus ne change qu''avec le statut';
  end if;
  return new;
end $fn$;

create or replace function private.touch_metric()
returns trigger language plpgsql set search_path = public, private as $fn$
begin
  if tg_op = 'INSERT' then
    new.updated_at := now();
  elsif (new.value, new.label, new.unit, new.period) is distinct from (old.value, old.label, old.unit, old.period) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $fn$;

create trigger touch_metric before insert or update on public.metrics
  for each row execute function private.touch_metric();
