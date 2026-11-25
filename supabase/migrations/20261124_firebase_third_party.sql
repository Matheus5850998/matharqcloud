insert into storage.buckets (id, name, public, file_size_limit)
values ('personal-files', 'personal-files', false, 52428800)
on conflict (id) do update
set public = false, file_size_limit = 52428800;

-- Firebase ID tokens do not include Supabase's "authenticated" role by default.
-- Restrict anon-role access to tokens issued for this exact Firebase project and UID.
drop policy if exists "Firebase users read own private files" on storage.objects;
create policy "Firebase users read own private files"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'personal-files'
    and (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and nullif((select auth.jwt()->>'sub'), '') is not null
    and (
      (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
      or (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
    )
  );

drop policy if exists "Firebase users upload own private files" on storage.objects;
create policy "Firebase users upload own private files"
  on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'personal-files'
    and (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and nullif((select auth.jwt()->>'sub'), '') is not null
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );

drop policy if exists "Firebase users delete own private files" on storage.objects;
create policy "Firebase users delete own private files"
  on storage.objects for delete to anon, authenticated
  using (
    bucket_id = 'personal-files'
    and (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and nullif((select auth.jwt()->>'sub'), '') is not null
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
  );
