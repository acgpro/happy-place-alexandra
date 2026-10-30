create type public.metric_period as enum ('hebdomadaire', 'mensuel', 'trimestriel', 'annuel');

alter table public.metrics add column period public.metric_period;

update public.metrics set period = (case key
  when 'nps' then 'trimestriel'
  when 'training_kpi' then 'mensuel'
  when 'active_users' then 'hebdomadaire'
  when 'absenteeism' then 'mensuel'
  when 'open_positions' then 'hebdomadaire'
  when 'training_hours' then 'hebdomadaire'
  when 'turnover' then 'mensuel'
  when 'engagement' then 'annuel'
end)::public.metric_period;

alter table public.metrics alter column period set not null;

create or replace view public.metrics_with_trend with (security_invoker = true) as
 select m.key, m.label, m.value, m.unit, m.updated_at,
        p.value as previous_value,
        case when p.value is null or p.value = m.value then 'stable'::text
             when m.value > p.value then 'hausse'::text
             else 'baisse'::text end as trend,
        case when p.value is null then null::numeric else m.value - p.value end as delta,
        m.period
 from public.metrics m
 left join lateral (select h.value from public.metrics_history h
                    where h.metric_key = m.key
                    order by h.recorded_at desc offset 1 limit 1) p on true;
