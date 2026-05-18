-- Repair partially created DBs (missing columns, RLS, bucket). Safe to re-run.
-- Run in Supabase SQL Editor if uploads fail with DB/RLS errors.

create table if not exists public.watermark_audio (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  content_type text not null default 'audio/mpeg',
  created_at timestamptz not null default now()
);

alter table public.watermark_audio add column if not exists filename text;
alter table public.watermark_audio add column if not exists storage_path text;
alter table public.watermark_audio add column if not exists content_type text;
alter table public.watermark_audio add column if not exists created_at timestamptz;

update public.watermark_audio
set content_type = coalesce(nullif(trim(content_type), ''), 'audio/mpeg')
where content_type is null;

update public.watermark_audio
set created_at = coalesce(created_at, now())
where created_at is null;

update public.watermark_audio
set filename = '(missing)'
where filename is null;

update public.watermark_audio
set storage_path = 'migrated/' || gen_random_uuid()::text
where storage_path is null;

alter table public.watermark_audio alter column filename set not null;
alter table public.watermark_audio alter column storage_path set not null;
alter table public.watermark_audio alter column content_type set not null;
alter table public.watermark_audio alter column created_at set not null;

alter table public.watermark_audio enable row level security;

drop policy if exists "watermark_audio_select_all" on public.watermark_audio;
drop policy if exists "watermark_audio_insert_all" on public.watermark_audio;

create policy "watermark_audio_select_all"
  on public.watermark_audio for select
  to anon, authenticated
  using (true);

create policy "watermark_audio_insert_all"
  on public.watermark_audio for insert
  to anon, authenticated
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert on public.watermark_audio to anon, authenticated;
grant all on public.watermark_audio to service_role;

insert into storage.buckets (id, name, public)
values ('audio', 'audio', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "audio_bucket_read" on storage.objects;
drop policy if exists "audio_bucket_insert" on storage.objects;
drop policy if exists "audio_bucket_update" on storage.objects;
drop policy if exists "audio_bucket_delete" on storage.objects;

create policy "audio_bucket_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'audio');

create policy "audio_bucket_insert"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'audio');

create policy "audio_bucket_update"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'audio')
  with check (bucket_id = 'audio');

create policy "audio_bucket_delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'audio');
