-- Airports alignment to the OurAirports layout (data/temp_data/airports.csv). Approved Oct 23 2026.
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
