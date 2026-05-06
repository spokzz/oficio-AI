create table if not exists public.ai_summary_translations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  ai_summary_id uuid not null references public.ai_summaries(id) on delete cascade,
  language text not null check (language in ('en', 'es')),
  summary text not null,
  action_needed text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ai_summary_id, language)
);

create index if not exists ai_summary_translations_business_language_idx
on public.ai_summary_translations(business_id, language);

drop trigger if exists ai_summary_translations_set_updated_at on public.ai_summary_translations;
create trigger ai_summary_translations_set_updated_at
before update on public.ai_summary_translations
for each row execute function public.set_updated_at();

alter table public.ai_summary_translations enable row level security;

drop policy if exists "members read ai summary translations" on public.ai_summary_translations;
create policy "members read ai summary translations"
on public.ai_summary_translations for select
to authenticated
using (public.can_access_business(business_id));

drop policy if exists "members create ai summary translations" on public.ai_summary_translations;
create policy "members create ai summary translations"
on public.ai_summary_translations for insert
to authenticated
with check (public.can_access_business(business_id));

drop policy if exists "members update ai summary translations" on public.ai_summary_translations;
create policy "members update ai summary translations"
on public.ai_summary_translations for update
to authenticated
using (public.can_access_business(business_id))
with check (public.can_access_business(business_id));
