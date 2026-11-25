create table if not exists public.teacher_subjects (
  teacher_id text not null,
  subject_key text not null check (length(subject_key) between 1 and 80),
  subject_name text not null check (length(subject_name) between 1 and 80),
  created_at timestamptz not null default now(),
  primary key (teacher_id, subject_key)
);

alter table public.teacher_subjects enable row level security;

revoke all on public.teacher_subjects from public;
grant select, insert, update, delete on public.teacher_subjects to anon, authenticated;

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

notify pgrst, 'reload schema';
