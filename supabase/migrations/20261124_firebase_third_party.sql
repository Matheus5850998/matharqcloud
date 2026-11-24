insert into storage.buckets (id, name, public, file_size_limit)
values ('personal-files', 'personal-files', false, 52428800)
on conflict (id) do update
set public = false, file_size_limit = 52428800;

drop policy if exists "Firebase users read own private files" on storage.objects;
create policy "Firebase users read own private files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'personal-files'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );

drop policy if exists "Firebase users upload own private files" on storage.objects;
create policy "Firebase users upload own private files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'personal-files'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );

drop policy if exists "Firebase users delete own private files" on storage.objects;
create policy "Firebase users delete own private files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'personal-files'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
