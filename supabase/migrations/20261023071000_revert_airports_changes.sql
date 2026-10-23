-- Airports stay on the original layout for now; see supabase/pending/airports_match_source_data.sql.
drop index if exists public.airports_iso_region_idx;
drop index if exists public.airports_type_idx;
alter table public.airports drop constraint if exists airports_type_check;
alter table public.airports
  drop column continent, drop column iso_region, drop column scheduled_service,
  drop column gps_code, drop column local_code, drop column home_link,
  drop column wikipedia_link, drop column keywords;
alter table public.airports rename column municipality to city;
