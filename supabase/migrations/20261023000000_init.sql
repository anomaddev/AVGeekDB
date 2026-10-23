-- AVGeekDB initial schema. Placeholder columns mirror schema/*.schema.json; refine once data sources are known.

create table public.airports (
  id            bigint generated always as identity primary key,
  ident         text not null unique,
  iata          char(3),
  icao          char(4) unique,
  name          text not null,
  city          text,
  country       char(2) not null,
  latitude      double precision not null check (latitude between -90 and 90),
  longitude     double precision not null check (longitude between -180 and 180),
  elevation_ft  integer,
  type          text not null,
  is_sample     boolean not null default false,
  updated_at    timestamptz not null default now()
);
create index airports_iata_idx on public.airports (iata);
create index airports_country_idx on public.airports (country);

create table public.airlines (
  id            bigint generated always as identity primary key,
  iata          char(2),
  icao          char(3) unique,
  name          text not null,
  callsign      text,
  country       char(2) not null,
  hub_airport_id bigint references public.airports(id) on delete set null,
  active        boolean not null default true,
  is_sample     boolean not null default false,
  updated_at    timestamptz not null default now()
);
create index airlines_iata_idx on public.airlines (iata);

create table public.aircraft_types (
  id            bigint generated always as identity primary key,
  icao_code     text not null unique,
  iata_code     text,
  manufacturer  text not null,
  model         text not null,
  engine_type   text check (engine_type in ('jet','turboprop','piston','electric')),
  engine_count  smallint,
  wake_category char(1) check (wake_category in ('L','M','H','J')),
  is_sample     boolean not null default false,
  updated_at    timestamptz not null default now()
);

-- Relation: which airlines operate which aircraft types (fleet). Populated when sources allow.
create table public.airline_fleet (
  airline_id       bigint not null references public.airlines(id) on delete cascade,
  aircraft_type_id bigint not null references public.aircraft_types(id) on delete cascade,
  count            integer,
  primary key (airline_id, aircraft_type_id)
);

-- Reference data is public read; writes only via service role.
alter table public.airports enable row level security;
alter table public.airlines enable row level security;
alter table public.aircraft_types enable row level security;
alter table public.airline_fleet enable row level security;
create policy "public read" on public.airports for select using (true);
create policy "public read" on public.airlines for select using (true);
create policy "public read" on public.aircraft_types for select using (true);
create policy "public read" on public.airline_fleet for select using (true);

-- API keys: only a SHA-256 hash (+pepper) is stored; plaintext shown once at creation.
create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null default 'default',
  prefix       text not null,               -- first chars, for display (avg_xxxxxxxx)
  key_hash     text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index api_keys_user_idx on public.api_keys (user_id);

create table public.api_usage (
  id         bigint generated always as identity primary key,
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  endpoint   text not null,
  status     smallint not null,
  created_at timestamptz not null default now()
);
create index api_usage_key_time_idx on public.api_usage (api_key_id, created_at desc);

-- Daily rollup for the dashboard.
create view public.api_usage_daily with (security_invoker = true) as
  select api_key_id, date_trunc('day', created_at) as day, count(*) as requests,
         count(*) filter (where status = 429) as rate_limited
  from public.api_usage group by 1, 2;

alter table public.api_keys enable row level security;
alter table public.api_usage enable row level security;
-- Users see and revoke their own keys. Inserts go through the server (service role) so the hash is computed server-side.
create policy "own keys read" on public.api_keys for select using (auth.uid() = user_id);
create policy "own keys revoke" on public.api_keys for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own usage read" on public.api_usage for select
  using (exists (select 1 from public.api_keys k where k.id = api_key_id and k.user_id = auth.uid()));

-- ---------------------------------------------------------------- dataset versions
create table public.data_versions (
  id           bigint generated always as identity primary key,
  version      text not null unique,          -- e.g. 2026.10.23
  released_on  date not null default current_date,
  notes        text,
  is_current   boolean not null default false,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create unique index data_versions_one_current on public.data_versions (is_current) where is_current;
alter table public.data_versions enable row level security;
create policy "public read" on public.data_versions for select using (true);
alter table public.airports       add column data_version_id bigint references public.data_versions(id);
alter table public.airlines       add column data_version_id bigint references public.data_versions(id);
alter table public.aircraft_types add column data_version_id bigint references public.data_versions(id);

-- ---------------------------------------------------------------- roles
create type public.app_role as enum ('admin', 'editor', 'contributor');
create table public.user_roles (
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table public.user_roles enable row level security;
create or replace function public.has_role(r public.app_role) returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.user_roles where user_id = auth.uid()
     and (role = r or role = 'admin' or (r = 'contributor' and role = 'editor'))) $$;
create policy "own roles read" on public.user_roles for select using (auth.uid() = user_id or public.has_role('admin'));
create policy "admin manage roles" on public.user_roles for all using (public.has_role('admin')) with check (public.has_role('admin'));

-- Editors/admins may write reference data and versions directly.
create policy "editor write" on public.airports       for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy "editor write" on public.airlines       for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy "editor write" on public.aircraft_types for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy "editor write" on public.airline_fleet  for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy "admin write"  on public.data_versions  for all using (public.has_role('admin'))  with check (public.has_role('admin'));

-- ---------------------------------------------------------------- submissions (contributor corrections, reviewed by editors)
create type public.submission_status as enum ('pending', 'approved', 'rejected');
create table public.submissions (
  id           uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references auth.users(id) on delete cascade,
  entity       text not null check (entity in ('airports','airlines','aircraft_types')),
  record_id    bigint,                         -- null = proposed new record
  payload      jsonb not null,                 -- proposed field values
  source_url   text,
  status       public.submission_status not null default 'pending',
  reviewed_by  uuid references auth.users(id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.submissions enable row level security;
create policy "contributor create" on public.submissions for insert with check (auth.uid() = submitted_by and public.has_role('contributor'));
create policy "own or editor read" on public.submissions for select using (auth.uid() = submitted_by or public.has_role('editor'));
create policy "editor review" on public.submissions for update using (public.has_role('editor')) with check (public.has_role('editor'));
