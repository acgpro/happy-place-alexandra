alter policy "Read responses" on public.submission_responses using (
  private.is_allowed() and (
    private.is_admin()
    or responded_by_email = lower(auth.jwt() ->> 'email')
    or (private.current_app_role() = 'manager' and exists (
          select 1 from public.submissions s
          where s.id = submission_responses.submission_id and private.can_review_team(s.team)))
    or exists (select 1 from public.submissions s
               where s.id = submission_responses.submission_id and s.status = 'validée'
                 and (visibility = 'entreprise'
                      or s.submitted_by_email = lower(auth.jwt() ->> 'email')))
  )
);
revoke delete, truncate, references, trigger on public.submission_responses from authenticated;
