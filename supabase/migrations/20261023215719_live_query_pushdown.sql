-- Live API pushes filters/search down to PostgREST (api/src/supabase.ts SupabaseDataSource.query).
-- Trigram GIN indexes serve the case-insensitive ilike used for both q search (*q*) and equality filters.
create extension if not exists pg_trgm with schema extensions;

-- Computed field so q can search aircraft_types.alternate_names (text[]); superseded by search_aircraft_types() in the next migration.
create or replace function public.alternate_names_text(public.aircraft_types)
returns text language sql immutable set search_path = '' as $$ select array_to_string($1.alternate_names, ',') $$;

create index if not exists airports_name_trgm on public.airports using gin (name extensions.gin_trgm_ops);
create index if not exists airports_municipality_trgm on public.airports using gin (municipality extensions.gin_trgm_ops);
create index if not exists airports_keywords_trgm on public.airports using gin (keywords extensions.gin_trgm_ops);
create index if not exists airports_ident_trgm on public.airports using gin (ident extensions.gin_trgm_ops);
create index if not exists airports_icao_trgm on public.airports using gin ((icao::text) extensions.gin_trgm_ops);
create index if not exists airports_iata_trgm on public.airports using gin ((iata::text) extensions.gin_trgm_ops);
create index if not exists airports_country_idx on public.airports (country);
create index if not exists airlines_name_trgm on public.airlines using gin (name extensions.gin_trgm_ops);
create index if not exists airlines_callsign_trgm on public.airlines using gin (callsign extensions.gin_trgm_ops);
create index if not exists aircraft_types_name_trgm on public.aircraft_types using gin (name extensions.gin_trgm_ops);
