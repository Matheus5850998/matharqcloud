create table if not exists public.app_owner (
  id smallint primary key check (id = 1),
  user_id uuid not null unique references auth.users (id) on delete cascade
);

alter table public.app_owner enable row level security;
revoke all on public.app_owner from public, anon, authenticated;

insert into public.app_owner (id, user_id)
values (1, '6e960d28-f418-410d-b272-e31c22b59ede'::uuid)
on conflict (id) do update set user_id = excluded.user_id;

create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_owner
    where id = 1 and user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_app_owner() from public, anon;
grant execute on function public.is_app_owner() to authenticated;

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null unique,
  name text not null check (char_length(name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) <= 255),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  created_at timestamptz not null default now()
);

create index if not exists files_owner_created_at_idx
  on public.files (owner_id, created_at desc);

alter table public.files enable row level security;
revoke all on public.files from public, anon;
grant select, insert, delete on public.files to authenticated;

drop policy if exists "Owner can read their files" on public.files;
create policy "Owner can read their files"
  on public.files for select to authenticated
  using (public.is_app_owner() and owner_id = (select auth.uid()));

drop policy if exists "Owner can register their files" on public.files;
create policy "Owner can register their files"
  on public.files for insert to authenticated
  with check (public.is_app_owner() and owner_id = (select auth.uid()));

drop policy if exists "Owner can delete their files" on public.files;
create policy "Owner can delete their files"
  on public.files for delete to authenticated
  using (public.is_app_owner() and owner_id = (select auth.uid()));

create table if not exists public.app_settings (
  owner_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null default 'Matheus' check (char_length(display_name) between 1 and 60),
  accent_color text not null default '#65d8aa' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon;
grant select, insert, update on public.app_settings to authenticated;

drop policy if exists "Owner can manage personal settings" on public.app_settings;
create policy "Owner can manage personal settings"
  on public.app_settings for all to authenticated
  using (public.is_app_owner() and owner_id = (select auth.uid()))
  with check (public.is_app_owner() and owner_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('personal-files', 'personal-files', false, 52428800)
on conflict (id) do update
set public = false, file_size_limit = 52428800;

drop policy if exists "Owner can read private files" on storage.objects;
create policy "Owner can read private files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'personal-files'
    and public.is_app_owner()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owner can upload private files" on storage.objects;
create policy "Owner can upload private files"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'personal-files'
    and public.is_app_owner()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owner can delete private files" on storage.objects;
create policy "Owner can delete private files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'personal-files'
    and public.is_app_owner()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
