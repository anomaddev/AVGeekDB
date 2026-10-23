-- q search moves to security-invoker RPCs; API keys gain a prefix index.
drop function if exists public.alternate_names_text(public.aircraft_types);


-- Escape LIKE metacharacters so q matches literally, like the in-memory substring search.
create or replace function public.like_contains(q text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- q search, one per entity, over the same fields as query.ts SEARCH_FIELDS. Security invoker: RLS of the caller applies.
create or replace function public.search_airports(q text) returns setof public.airports
language sql stable security invoker set search_path = '' as $$
  select a.* from public.airports a, lateral (select public.like_contains(q) p) s
  where a.name ilike s.p or a.municipality ilike s.p or a.iata::text ilike s.p or a.icao::text ilike s.p or a.ident ilike s.p or a.keywords ilike s.p
$$;
create or replace function public.search_airlines(q text) returns setof public.airlines
language sql stable security invoker set search_path = '' as $$
  select a.* from public.airlines a, lateral (select public.like_contains(q) p) s
  where a.name ilike s.p or a.callsign ilike s.p or a.iata::text ilike s.p or a.icao::text ilike s.p or a.ident ilike s.p
$$;
create or replace function public.search_aircraft_types(q text) returns setof public.aircraft_types
language sql stable security invoker set search_path = '' as $$
  select t.* from public.aircraft_types t, lateral (select public.like_contains(q) p) s
  where t.name ilike s.p or t.short_name ilike s.p or array_to_string(t.alternate_names, ',') ilike s.p or t.family ilike s.p
     or t.manufacturer ilike s.p or t.icao ilike s.p or t.iata ilike s.p or t.ident ilike s.p
$$;
revoke execute on function public.search_airports(text), public.search_airlines(text), public.search_aircraft_types(text) from public, anon, authenticated;
grant execute on function public.search_airports(text), public.search_airlines(text), public.search_aircraft_types(text) to service_role;


-- API keys are looked up by stored prefix, then the hash is compared in constant time.
create index if not exists api_keys_prefix_idx on public.api_keys (prefix);
