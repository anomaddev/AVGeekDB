# aircraft_types

Two different tables live in this directory.

## `aircraft_types.csv` — schema snapshot (sample)

This is the file the API loads and `npm run data:build` validates against `schema/aircraft_types.schema.json`. **The three rows are SAMPLE data** (`is_sample=true`). `npm run data:export` overwrites this file from Supabase. Do not replace it with `aircraft.csv`: the columns do not match, and the export would wipe the replacement.

## `aircraft.csv` — verified type list

Promoted from `data/temp_data/aircraft.csv` (that copy is removed). 651 rows in the wide research format (`ident`, `icao`, `family`, `wiki_link`, and the rest), checked against ICAO Doc 8643 and Wikipedia. The loader does not read this file. It keeps the name `aircraft.csv` so it does not collide with the schema snapshot, whose path is fixed as `data/<entity>/<entity>.csv`.

- `changes.csv` — every applied field edit (`ident`, `field`, `old_value`, `new_value`, `source_url`, `reason`).
- `flags.csv` — open issues left for a human. Nothing in that file was applied to `aircraft.csv`.

`data/temp_data/airports.csv` and `bkp/` are unchanged. The verified airline list lives at `data/airlines/airlines_full.csv`.
