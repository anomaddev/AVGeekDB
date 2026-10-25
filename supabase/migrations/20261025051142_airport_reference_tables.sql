-- Airport reference data mirrors data/airports/*.csv.
-- OurAirports ids are the primary keys so runways, frequencies, and navaids
-- point at the same rows the files do. Airlines, aircraft, and API keys stay.
-- The public API still says country / iata / icao / latitude / longitude;
-- those names are mapped at the query layer (iso_country, iata_code, icao_code,
-- latitude_deg, longitude_deg).

drop function if exists public.search_airports(text);

drop table if exists public.airports cascade;

create table public.countries (
  id              bigint primary key,
  code            char(2) not null unique,
  name            text not null,
  continent       char(2) not null check (continent in ('AF','AN','AS','EU','NA','OC','SA')),
  wikipedia_link  text,
  keywords        text,
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 1
);
comment on table public.countries is 'data/airports/countries.csv. code is the country key (ISO 3166-1 alpha-2, plus XK).';

create table public.regions (
  id              bigint primary key,
  code            text not null unique,
  local_code      text,
  name            text not null,
  continent       char(2) not null check (continent in ('AF','AN','AS','EU','NA','OC','SA')),
  iso_country     char(2) not null references public.countries (code),
  wikipedia_link  text,
  keywords        text,
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 1
);
create index regions_iso_country_idx on public.regions (iso_country);
comment on table public.regions is 'data/airports/regions.csv. code is the region key (iso_region on airports).';

create table public.airports (
  id                 bigint primary key,
  ident              text not null unique,
  type               text not null check (type in ('large_airport','medium_airport','small_airport','heliport','seaplane_base','balloonport','closed')),
  name               text not null,
  latitude_deg       double precision not null check (latitude_deg between -90 and 90),
  longitude_deg      double precision not null check (longitude_deg between -180 and 180),
  elevation_ft       integer,
  continent          char(2) not null check (continent in ('AF','AN','AS','EU','NA','OC','SA')),
  iso_country        char(2) not null references public.countries (code),
  iso_region         text not null references public.regions (code),
  municipality       text,
  scheduled_service  boolean not null default false,
  icao_code          char(4) unique,
  iata_code          char(3),
  gps_code           text,
  local_code         text,
  home_link          text,
  wikipedia_link     text,
  keywords           text,
  is_sample          boolean not null default false,
  updated_at         timestamptz not null default now(),
  data_version_id    bigint references public.data_versions (id),
  row_version        integer not null default 1
);
create index airports_iso_country_idx on public.airports (iso_country);
create index airports_iso_region_idx on public.airports (iso_region);
create index airports_iata_code_idx on public.airports (iata_code);
create index airports_type_idx on public.airports (type);
create index airports_name_trgm on public.airports using gin (name extensions.gin_trgm_ops);
create index airports_municipality_trgm on public.airports using gin (municipality extensions.gin_trgm_ops);
create index airports_keywords_trgm on public.airports using gin (keywords extensions.gin_trgm_ops);
create index airports_ident_trgm on public.airports using gin (ident extensions.gin_trgm_ops);
create index airports_icao_trgm on public.airports using gin ((icao_code::text) extensions.gin_trgm_ops);
create index airports_iata_trgm on public.airports using gin ((iata_code::text) extensions.gin_trgm_ops);
-- Lets runways and frequencies reference (id, ident) as a single key, so the two source columns stay on the same airport.
create unique index airports_id_ident_key on public.airports (id, ident);
comment on table public.airports is 'data/airports/airports.csv. id and ident are the OurAirports keys.';
comment on column public.airports.iso_country is 'countries.code. Exposed to the API as country.';
comment on column public.airports.iata_code is 'Exposed to the API as iata.';
comment on column public.airports.icao_code is 'Exposed to the API as icao.';
comment on column public.airports.latitude_deg is 'Exposed to the API as latitude.';
comment on column public.airports.longitude_deg is 'Exposed to the API as longitude.';

create table public.runways (
  id                         bigint primary key,
  airport_ref                bigint not null,
  airport_ident              text not null,
  length_ft                  integer,
  width_ft                   integer,
  surface                    text,
  lighted                    boolean not null,
  closed                     boolean not null,
  le_ident                   text,
  le_latitude_deg            double precision,
  le_longitude_deg           double precision,
  le_elevation_ft            integer,
  le_heading_degT            double precision,
  le_displaced_threshold_ft  integer,
  he_ident                   text,
  he_latitude_deg            double precision,
  he_longitude_deg           double precision,
  he_elevation_ft            integer,
  he_heading_degT            double precision,
  he_displaced_threshold_ft  integer,
  updated_at                 timestamptz not null default now(),
  row_version                integer not null default 1,
  foreign key (airport_ref, airport_ident) references public.airports (id, ident) on update cascade on delete cascade
);
create index runways_airport_ref_idx on public.runways (airport_ref);
comment on table public.runways is 'data/airports/runways.csv. airport_ref is airports.id; airport_ident is airports.ident.';

create table public.airport_frequencies (
  id              bigint primary key,
  airport_ref     bigint not null,
  airport_ident   text not null,
  type            text not null,
  description     text,
  frequency_mhz   double precision not null,
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 1,
  foreign key (airport_ref, airport_ident) references public.airports (id, ident) on update cascade on delete cascade
);
create index airport_frequencies_airport_ref_idx on public.airport_frequencies (airport_ref);
comment on table public.airport_frequencies is 'data/airports/airport-frequencies.csv. airport_ref is airports.id; airport_ident is airports.ident.';

create table public.navaids (
  id                       bigint primary key,
  filename                 text not null,
  ident                    text not null,
  name                     text not null,
  type                     text not null,
  frequency_khz            integer not null,
  latitude_deg             double precision not null check (latitude_deg between -90 and 90),
  longitude_deg            double precision not null check (longitude_deg between -180 and 180),
  elevation_ft             integer,
  iso_country              char(2) not null references public.countries (code),
  dme_frequency_khz        integer,
  dme_channel              text,
  dme_latitude_deg         double precision,
  dme_longitude_deg        double precision,
  dme_elevation_ft         integer,
  slaved_variation_deg     double precision,
  magnetic_variation_deg   double precision,
  usage_type               text,
  power                    text,
  associated_airport       text references public.airports (ident) on update cascade on delete set null,
  updated_at               timestamptz not null default now(),
  row_version              integer not null default 1
);
create index navaids_iso_country_idx on public.navaids (iso_country);
create index navaids_associated_airport_idx on public.navaids (associated_airport);
create index navaids_ident_idx on public.navaids (ident);
comment on table public.navaids is 'data/airports/navaids.csv. iso_country is countries.code; associated_airport is airports.ident.';
comment on column public.navaids.usage_type is 'CSV column usageType.';

alter table public.airline_hubs
  add constraint airline_hubs_airport_id_fkey
  foreign key (airport_id) references public.airports (id) on delete cascade;

-- q search keeps the API field list. iata/icao are iata_code/icao_code in the table.
create or replace function public.search_airports(q text) returns setof public.airports
language sql stable security invoker set search_path = '' as $$
  select a.* from public.airports a, lateral (select public.like_contains(q) p) s
  where a.name ilike s.p or a.municipality ilike s.p or a.iata_code::text ilike s.p
     or a.icao_code::text ilike s.p or a.ident ilike s.p or a.keywords ilike s.p
$$;
revoke execute on function public.search_airports(text) from public, anon, authenticated;
grant execute on function public.search_airports(text) to service_role;

-- Housekeeping matches the other reference tables.
create trigger bump_row_version before update on public.countries for each row execute function public.bump_row_version();
create trigger bump_row_version before update on public.regions for each row execute function public.bump_row_version();
create trigger bump_row_version before update on public.airports for each row execute function public.bump_row_version();
create trigger bump_row_version before update on public.runways for each row execute function public.bump_row_version();
create trigger bump_row_version before update on public.airport_frequencies for each row execute function public.bump_row_version();
create trigger bump_row_version before update on public.navaids for each row execute function public.bump_row_version();

create trigger audit after insert or update or delete on public.countries for each row execute function public.audit_row_change('id');
create trigger audit after insert or update or delete on public.regions for each row execute function public.audit_row_change('id');
create trigger audit after insert or update or delete on public.airports for each row execute function public.audit_row_change('id');
create trigger audit after insert or update or delete on public.runways for each row execute function public.audit_row_change('id');
create trigger audit after insert or update or delete on public.airport_frequencies for each row execute function public.audit_row_change('id');
create trigger audit after insert or update or delete on public.navaids for each row execute function public.audit_row_change('id');

alter table public.countries enable row level security;
alter table public.regions enable row level security;
alter table public.airports enable row level security;
alter table public.runways enable row level security;
alter table public.airport_frequencies enable row level security;
alter table public.navaids enable row level security;

create policy "public read" on public.countries for select using (true);
create policy "public read" on public.regions for select using (true);
create policy "public read" on public.airports for select using (true);
create policy "public read" on public.runways for select using (true);
create policy "public read" on public.airport_frequencies for select using (true);
create policy "public read" on public.navaids for select using (true);

create policy "editor write" on public.countries for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy "editor write" on public.regions for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy "editor write" on public.airports for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy "editor write" on public.runways for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy "editor write" on public.airport_frequencies for all using (public.has_role('editor')) with check (public.has_role('editor'));
create policy "editor write" on public.navaids for all using (public.has_role('editor')) with check (public.has_role('editor'));

-- Data API access is granted explicitly. Reads are public; writes are editors (RLS) and the service role.
grant select on public.countries, public.regions, public.airports, public.runways, public.airport_frequencies, public.navaids to anon;
grant select, insert, update, delete on public.countries, public.regions, public.airports, public.runways, public.airport_frequencies, public.navaids to authenticated, service_role;
