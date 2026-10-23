# airlines

Two different tables live in this directory.

## `airlines.csv` — schema snapshot (sample)

This is the file the API loads and `npm run data:build` validates against `schema/airlines.schema.json`. **The three rows are SAMPLE data** (`is_sample=true`). `npm run data:export` overwrites this file from Supabase. Do not replace it with `airlines_full.csv`: the columns do not match, and the export would wipe the replacement.

## `airlines_full.csv` — verified airline list

Promoted from `data/temp_data/airlines.csv` (that copy is removed). 5,897 rows in the research format (`ident`, `name`, `iata`, `icao`, `callsign`, `country`, `country_code`, `active`, `major`, `updated_at`), checked against Wikipedia's List of airline codes (ICAO Doc 8585 was unavailable). The loader does not read this file. It is named `airlines_full.csv` so it does not collide with the schema snapshot, whose path is fixed as `data/<entity>/<entity>.csv`.

- `changes.csv` — every applied field edit (`key`, `field`, `old_value`, `new_value`, `source_url`, `reason`). `key` is `ident|name`.
- `flags.csv` — open issues left for a human. Nothing in that file was applied to `airlines_full.csv`.

`data/temp_data/airports.csv` and `bkp/` are unchanged.
