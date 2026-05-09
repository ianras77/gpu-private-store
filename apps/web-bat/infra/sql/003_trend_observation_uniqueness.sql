-- Deduplicate trend observations before enforcing uniqueness.
with ranked as (
  select
    id,
    row_number() over (
      partition by theme_id, observation_date
      order by id desc
    ) as row_rank
  from trend_observations
)
delete from trend_observations t
using ranked r
where t.id = r.id
  and r.row_rank > 1;

create unique index if not exists uq_trend_observations_theme_day
on trend_observations (theme_id, observation_date);
