-- Fix uploads from browser (anon): policies must apply to anon/authenticated explicitly
-- on some Supabase versions / defaults. Run in SQL Editor if uploads still fail after
-- the initial restore migration.

-- ---------------------------------------------------------------------------
-- public.watermark_audio
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- storage.objects (bucket audio)
-- ---------------------------------------------------------------------------

drop policy if exists "audio_bucket_read" on storage.objects;
drop policy if exists "audio_bucket_insert" on storage.objects;
drop policy if exists "audio_bucket_update" on storage.objects;
drop policy if exists "audio_bucket_delete" on storage.objects;

create policy "audio_bucket_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'audio');

create policy "audio_bucket_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'audio');

create policy "audio_bucket_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'audio')
  with check (bucket_id = 'audio');

create policy "audio_bucket_delete"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'audio');
