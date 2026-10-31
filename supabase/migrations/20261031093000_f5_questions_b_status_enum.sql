-- F5 (suite) : le statut d'une question devient un ENUM, comme les autres statuts du projet.
-- Motif : private.audit_enum_literals() signalait 'répondue' (valeur absente de tout ENUM) dans public.answer_question,
-- ce qui faisait passer le test de fumée de 11 à 10 sur 13. La table est vide au moment de la migration.

create type public.question_status as enum ('en attente', 'répondue');

drop policy "Read questions" on public.questions;
drop policy "Author deletes pending question" on public.questions;
alter table public.questions drop constraint questions_answer_coherent;
alter table public.questions drop constraint questions_status_check;

alter table public.questions alter column status drop default;
alter table public.questions
  alter column status type public.question_status using status::public.question_status;
alter table public.questions alter column status set default 'en attente';

alter table public.questions add constraint questions_answer_coherent check (
  (status = 'en attente' and answer_body is null and answered_by_email is null and answered_at is null)
  or (status = 'répondue' and answer_body is not null and answered_by_email is not null and answered_at is not null)
);

create policy "Read questions" on public.questions
for select to authenticated using (
  private.is_allowed() and (
    asked_by_email = lower(auth.jwt() ->> 'email')
    or private.is_manager_of_team(team)
    or (private.is_admin() and status = 'en attente')
  )
);

create policy "Author deletes pending question" on public.questions
for delete to authenticated using (
  asked_by_email = lower(auth.jwt() ->> 'email') and status = 'en attente'
);
