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
