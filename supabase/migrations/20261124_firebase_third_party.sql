insert into storage.buckets (id, name, public, file_size_limit)
values ('personal-files', 'personal-files', false, 52428800)
on conflict (id) do update
set public = false, file_size_limit = 52428800;

create table if not exists public.teacher_student_links (
  student_id text not null,
  teacher_id text not null,
  teacher_code text,
  created_at timestamptz not null default now(),
  primary key (student_id, teacher_id)
);

alter table public.teacher_student_links
  add column if not exists teacher_code text;

create table if not exists public.teacher_directory (
  teacher_id text primary key,
  teacher_code text not null unique check (length(teacher_code) between 1 and 80),
  updated_at timestamptz not null default now()
);

create table if not exists public.teacher_subjects (
  teacher_id text not null,
  subject_key text not null check (length(subject_key) between 1 and 80),
  subject_name text not null check (length(subject_name) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (teacher_id, subject_key)
);

alter table public.teacher_student_links enable row level security;
alter table public.teacher_directory enable row level security;
alter table public.teacher_subjects enable row level security;

revoke all on public.teacher_student_links, public.teacher_directory, public.teacher_subjects from public;
grant select, insert, update, delete on public.teacher_student_links, public.teacher_directory, public.teacher_subjects to anon, authenticated;

drop policy if exists "Firebase users read teacher directory" on public.teacher_directory;
create policy "Firebase users read teacher directory"
  on public.teacher_directory for select to anon, authenticated
  using (
    (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
  );

drop policy if exists "Firebase teachers register own directory entry" on public.teacher_directory;
create policy "Firebase teachers register own directory entry"
  on public.teacher_directory for insert to anon, authenticated
  with check (
    (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and teacher_id = (select auth.jwt()->>'sub')
  );

drop policy if exists "Firebase teachers update own directory entry" on public.teacher_directory;
create policy "Firebase teachers update own directory entry"
  on public.teacher_directory for update to anon, authenticated
  using (
    (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and teacher_id = (select auth.jwt()->>'sub')
  )
  with check (
    (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and teacher_id = (select auth.jwt()->>'sub')
  );

drop policy if exists "Firebase users read linked teacher relationships" on public.teacher_student_links;
create policy "Firebase users read linked teacher relationships"
  on public.teacher_student_links for select to anon, authenticated
  using (
    (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and (
      student_id = (select auth.jwt()->>'sub')
      or teacher_id = (select auth.jwt()->>'sub')
    )
  );

drop policy if exists "Firebase students create own teacher links" on public.teacher_student_links;
create policy "Firebase students create own teacher links"
  on public.teacher_student_links for insert to anon, authenticated
  with check (
    (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and student_id = (select auth.jwt()->>'sub')
    and teacher_id <> student_id
    and teacher_code is not null
    and exists (
      select 1
      from public.teacher_directory as directory
      where directory.teacher_id = teacher_student_links.teacher_id
        and directory.teacher_code = teacher_student_links.teacher_code
    )
  );

drop policy if exists "Firebase users delete linked relationships" on public.teacher_student_links;
create policy "Firebase users delete linked relationships"
  on public.teacher_student_links for delete to anon, authenticated
  using (
    (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and (
      student_id = (select auth.jwt()->>'sub')
      or teacher_id = (select auth.jwt()->>'sub')
    )
  );

drop policy if exists "Firebase users read relevant teacher subjects" on public.teacher_subjects;
create policy "Firebase users read relevant teacher subjects"
  on public.teacher_subjects for select to anon, authenticated
  using (
    (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and (
      teacher_id = (select auth.jwt()->>'sub')
      or exists (
        select 1
        from public.teacher_student_links as link
        where link.student_id = (select auth.jwt()->>'sub')
          and link.teacher_id = teacher_subjects.teacher_id
      )
    )
  );

drop policy if exists "Firebase teachers manage own subjects" on public.teacher_subjects;
create policy "Firebase teachers manage own subjects"
  on public.teacher_subjects for insert to anon, authenticated
  with check (
    (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and teacher_id = (select auth.jwt()->>'sub')
  );

drop policy if exists "Firebase teachers delete own subjects" on public.teacher_subjects;
create policy "Firebase teachers delete own subjects"
  on public.teacher_subjects for delete to anon, authenticated
  using (
    (select auth.jwt()->>'iss') = 'https://securetoken.google.com/mathcloud-f69ad'
    and (select auth.jwt()->>'aud') = 'mathcloud-f69ad'
    and teacher_id = (select auth.jwt()->>'sub')
  );

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
      or (
        (storage.foldername(name))[2] = (select auth.jwt()->>'sub')
        and metadata->>'teacher_id' = (select auth.jwt()->>'sub')
        and exists (
          select 1
          from public.teacher_student_links as link
          join public.teacher_subjects as subject
            on subject.teacher_id = link.teacher_id
          where link.student_id = (storage.foldername(name))[1]
            and link.teacher_id = (select auth.jwt()->>'sub')
            and subject.subject_key = metadata->>'subject_key'
        )
      )
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
    and (
      (storage.foldername(name))[2] = 'private'
      or (
        (storage.foldername(name))[2] = metadata->>'teacher_id'
        and nullif(metadata->>'subject_key', '') is not null
        and exists (
          select 1
          from public.teacher_student_links as link
          join public.teacher_subjects as subject
            on subject.teacher_id = link.teacher_id
          where link.student_id = (select auth.jwt()->>'sub')
            and link.teacher_id = (storage.foldername(name))[2]
            and subject.subject_key = metadata->>'subject_key'
        )
      )
    )
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
