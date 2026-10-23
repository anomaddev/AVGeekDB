-- Align reference tables with the real source files:
--   airports  <- data/temp_data/airports.csv (OurAirports layout, ~85k rows)
--   airlines  <- data/temp_data/airlines.csv (~5.9k rows)
--   aircraft_types <- data/aircraft_types/aircraft.csv (~650 rows)
-- Only sample rows exist today, so they are removed before tightening NOT NULL / unique rules.

delete from public.airline_fleet;
delete from public.airline_hubs;
delete from public.airports where is_sample;
delete from public.airlines where is_sample;
delete from public.aircraft_types where is_sample;

-- airports -------------------------------------------------------------------
alter table public.airports rename column city to municipality;
alter table public.airports
  add column continent char(2) check (continent in ('AF','AN','AS','EU','NA','OC','SA')),
  add column iso_region text,
  add column scheduled_service boolean not null default false,
  add column gps_code text,
  add column local_code text,
  add column home_link text,
  add column wikipedia_link text,
  add column keywords text;
alter table public.airports add constraint airports_type_check
  check (type in ('large_airport','medium_airport','small_airport','heliport','seaplane_base','balloonport','closed'));
create index airports_iso_region_idx on public.airports (iso_region);
create index airports_type_idx on public.airports (type);

-- airlines -------------------------------------------------------------------
alter table public.airlines rename column country to country_code;
alter table public.airlines
  add column ident text,
  add column country text,
  add column major boolean not null default false;
update public.airlines set ident = coalesce(icao, iata, id::text) where ident is null;
alter table public.airlines alter column ident set not null;
alter table public.airlines add constraint airlines_ident_key unique (ident);
-- ICAO codes repeat in the source (defunct + current carriers), so ident is the key, not icao.
alter table public.airlines drop constraint airlines_icao_key;
create index airlines_icao_idx on public.airlines (icao);
create index airlines_country_code_idx on public.airlines (country_code);

-- aircraft_types -------------------------------------------------------------
alter table public.aircraft_types rename column icao_code to icao;
alter table public.aircraft_types rename column iata_code to iata;
alter table public.aircraft_types rename column model to name;
alter table public.aircraft_types drop constraint aircraft_types_icao_code_key;
alter table public.aircraft_types drop constraint aircraft_types_engine_type_check;
alter table public.aircraft_types
  add column ident text,
  add column family text,
  add column short_name text,
  add column alternate_names text[] not null default '{}',
  add column aircraft_type text check (aircraft_type in ('jet_aircraft','turboprop_aircraft','piston_aircraft','helicopter','amphibious')),
  add column in_production boolean not null default false,
  add column status text check (status in ('Operational','Retired','Limited','Prototype','Certification','Conceptual')),
  add column major boolean not null default false,
  add column cargo boolean not null default false,
  add column military boolean not null default false,
  add column wiki_link text,
  add column is_primary boolean not null default false;
update public.aircraft_types set ident = icao where ident is null;
alter table public.aircraft_types alter column ident set not null;
alter table public.aircraft_types add constraint aircraft_types_ident_key unique (ident);
alter table public.aircraft_types add constraint aircraft_types_engine_type_check
  check (engine_type in ('Piston','Turbofan','Turbojet','Turboprop','Turboshaft','Electric'));
-- One ICAO designator covers several variants (e.g. B738 for 737-800 and BBJ2); is_primary flags the main variant(s).
create index aircraft_types_icao_idx on public.aircraft_types (icao);
create index aircraft_types_manufacturer_idx on public.aircraft_types (manufacturer);
