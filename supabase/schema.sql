-- StreetMaps: tabelas e regras de acesso para o Supabase.
-- Corre isto no SQL Editor do teu projeto Supabase.
-- As posições ao vivo NÃO ficam guardadas: passam só pelo canal Realtime "drivers".

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nick text not null check (char_length(nick) between 1 and 24),
  crew text check (char_length(crew) <= 40),
  car text check (char_length(car) <= 50),
  hp integer check (hp between 0 and 2000),
  mods text[] default '{}',
  updated_at timestamptz default now()
);
create unique index if not exists profiles_nick_unique on public.profiles (lower(nick));

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 60),
  starts_at timestamptz not null,
  place text check (char_length(place) <= 80),
  description text check (char_length(description) <= 400),
  lat double precision not null,
  lng double precision not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.rsvps (
  event_id uuid references public.events(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (event_id, user_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('police','crash','works','road')),
  lat double precision not null,
  lng double precision not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.rsvps enable row level security;
alter table public.reports enable row level security;

-- Toda a gente com sessão lê; cada pessoa só mexe no que é seu.
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles write own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "events read" on public.events for select to authenticated using (true);
create policy "events create" on public.events for insert to authenticated with check (created_by = auth.uid());
create policy "events delete own" on public.events for delete to authenticated using (created_by = auth.uid());

create policy "rsvps read" on public.rsvps for select to authenticated using (true);
create policy "rsvps create own" on public.rsvps for insert to authenticated with check (user_id = auth.uid());
create policy "rsvps delete own" on public.rsvps for delete to authenticated using (user_id = auth.uid());

create policy "reports read" on public.reports for select to authenticated using (true);
create policy "reports create" on public.reports for insert to authenticated with check (created_by = auth.uid());

-- Atualizações em tempo real para eventos, presenças, alertas e perfis.
alter publication supabase_realtime add table public.events, public.rsvps, public.reports, public.profiles;
