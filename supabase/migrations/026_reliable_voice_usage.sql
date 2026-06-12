update public.call_sessions
set qualified_business_seconds = greatest(
  qualified_business_seconds,
  floor(extract(epoch from (ended_at - started_at)))::integer
)
where contact_type = 'customer'
  and ended_at is not null
  and ended_at > started_at
  and coalesce(screening_result, '') not like 'monthly_limit_%';

delete from public.usage_events duplicate
using public.usage_events original
where duplicate.event_type = original.event_type
  and duplicate.source_id = original.source_id
  and duplicate.source_id is not null
  and duplicate.id > original.id;

create unique index if not exists usage_events_event_type_source_id_idx
on public.usage_events(event_type, source_id)
where source_id is not null;

insert into public.usage_events (
  business_id,
  event_type,
  quantity,
  unit,
  source_id,
  metadata,
  occurred_at
)
select
  call.business_id,
  'qualified_business_voice',
  call.qualified_business_seconds::numeric / 60,
  'minute',
  call.id,
  jsonb_build_object(
    'backfilled', true,
    'qualified_seconds', call.qualified_business_seconds
  ),
  coalesce(call.ended_at, call.started_at)
from public.call_sessions call
where call.contact_type = 'customer'
  and call.qualified_business_seconds > 0
  and coalesce(call.screening_result, '') not like 'monthly_limit_%'
  and not exists (
    select 1
    from public.usage_events usage
    where usage.event_type = 'qualified_business_voice'
      and usage.source_id = call.id
  );
