-- Restore public schema + storage for audio-watermark-magic (Supabase / PostgreSQL)
-- Run once in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Or: supabase db push (if you use Supabase CLI linked to this project)

-- ---------------------------------------------------------------------------
-- Tables (derived from src/integrations/supabase/types.ts)
-- ---------------------------------------------------------------------------

create table if not exists public.business_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.consultations (
  id uuid primary key default gen_random_uuid(),
  business text not null,
  business_type text not null,
  created_at timestamptz not null default now(),
  description text not null,
  name text not null,
  song_style text not null
);

create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  business_category text not null,
  created_at timestamptz not null default now(),
  featured boolean,
  genre text not null,
  song_url text not null,
  thumbnail text not null,
  title text not null,
  updated_at timestamptz not null default now()
);

-- Used by the app: WatermarkManager + fetchWatermarkAudio
create table if not exists public.watermark_audio (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  content_type text not null default 'audio/mpeg',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row Level Security (client uses publishable/anon key in this repo)
-- ---------------------------------------------------------------------------

alter table public.business_categories enable row level security;
alter table public.consultations enable row level security;
alter table public.settings enable row level security;
alter table public.songs enable row level security;
alter table public.watermark_audio enable row level security;

-- watermark_audio: app reads latest row + inserts after storage upload
drop policy if exists "watermark_audio_select_all" on public.watermark_audio;
create policy "watermark_audio_select_all"
  on public.watermark_audio for select
  using (true);

drop policy if exists "watermark_audio_insert_all" on public.watermark_audio;
create policy "watermark_audio_insert_all"
  on public.watermark_audio for insert
  with check (true);

-- Optional: tighten other tables; open policies keep types.ts schema usable if you add features later
drop policy if exists "business_categories_select_all" on public.business_categories;
create policy "business_categories_select_all"
  on public.business_categories for select using (true);

drop policy if exists "consultations_select_all" on public.consultations;
create policy "consultations_select_all"
  on public.consultations for select using (true);

drop policy if exists "settings_select_all" on public.settings;
create policy "settings_select_all"
  on public.settings for select using (true);

drop policy if exists "songs_select_all" on public.songs;
create policy "songs_select_all"
  on public.songs for select using (true);

-- ---------------------------------------------------------------------------
-- Storage: bucket "audio" (used by supabase.storage.from('audio'))
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do update
  set public = excluded.public;

-- Storage RLS policies on storage.objects
drop policy if exists "audio_bucket_read" on storage.objects;
create policy "audio_bucket_read"
  on storage.objects for select
  using (bucket_id = 'audio');

drop policy if exists "audio_bucket_insert" on storage.objects;
create policy "audio_bucket_insert"
  on storage.objects for insert
  with check (bucket_id = 'audio');

drop policy if exists "audio_bucket_update" on storage.objects;
create policy "audio_bucket_update"
  on storage.objects for update
  using (bucket_id = 'audio')
  with check (bucket_id = 'audio');

drop policy if exists "audio_bucket_delete" on storage.objects;
create policy "audio_bucket_delete"
  on storage.objects for delete
  using (bucket_id = 'audio');

-- ---------------------------------------------------------------------------
-- API access (PostgREST requires table privileges for anon / authenticated)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select, insert on public.watermark_audio to anon, authenticated;
grant select on public.business_categories to anon, authenticated;
grant select on public.consultations to anon, authenticated;
grant select on public.settings to anon, authenticated;
grant select on public.songs to anon, authenticated;

grant all on public.watermark_audio to service_role;
grant all on public.business_categories to service_role;
grant all on public.consultations to service_role;
grant all on public.settings to service_role;
grant all on public.songs to service_role;
