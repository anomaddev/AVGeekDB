# AVGeekDB

Open, easy-to-use data for **aircraft types, airlines and airports**: downloadable dumps (CSV / JSON / SQLite) plus a free API (API key required).

> ⚠️ **Scaffold only.** Each `data/<entity>/<entity>.csv` holds 3 clearly marked SAMPLE rows (`is_sample=true`). Those are the files the API and `npm run data:build` load. `data/aircraft_types/aircraft.csv` and `data/airlines/airlines_full.csv` are verified lists and are not those snapshots. Real sources for the schema snapshots are still TBD.

## Layout
```
data/            canonical CSV per entity (`<entity>/<entity>.csv`) + VERSION (dataset version) + LICENSE.md (TODO)
                 `<entity>/<entity>.json` and `avgeekdb.sqlite` are the committed JSON and SQLite downloads (`npm run data:build` rewrites them)
                 aircraft_types/ also holds aircraft.csv (verified list) plus changes.csv and flags.csv
                 airlines/ also holds airlines_full.csv (verified list) plus changes.csv and flags.csv
schema/          JSON Schema per entity (placeholder fields)
scripts/         export-from-supabase.ts (Supabase → data/, used by the weekly snapshot workflow)
                 build-data.ts (validate -> dist/{csv,json}, avgeekdb.sqlite, manifest.json, and data/<entity>.json + data/avgeekdb.sqlite)
                 upload-to-storage.ts (STUB: publish dist/ to Supabase Storage)
api/             @avgeekdb/api: shared logic (key hashing/verify, per-key rate limit, query handler, data version)
web/             Next.js 16 app: landing, /docs, /downloads, /get-key, /signup, /login, /dashboard, /contribute, /admin, public API /v1/*
web/openapi.yaml OpenAPI 3.1 spec (also served at /openapi.yaml)
supabase/        migrations/ (Postgres schema + RLS) and seed.sql (sample rows)
docs/ci-drafts/  GitHub Actions drafts: ci.yml, data-snapshot.yml (move to .github/workflows/)
```

## Quick start
```bash
npm install
npm run build                   # data build + Next build, no Supabase needed (AVGEEKDB_MOCK defaults to true)
npm run dev -w web
curl -H "x-api-key: avg_demo_0000000000000000000000000000" "localhost:3000/v1/airports?q=heathrow"
```

## Source of truth
Supabase Postgres is canonical. `data/` is a versioned snapshot exported weekly (`npm run data:export`, draft workflow
`docs/ci-drafts/data-snapshot.yml`) and opened as a PR. Every change to reference tables is recorded in `change_log`
by an audit trigger, and rows carry `updated_at` + `row_version`.

## Data model
`airports`, `airlines`, `aircraft_types`; join tables `airline_hubs` (airline ↔ airport, `is_primary`) and `airline_fleet`;
`data_versions`; `user_roles` (admin/editor/contributor); `submissions`; `change_log`; `api_keys` (hashed); `api_usage`.

## API
`GET /v1/airports | /v1/airlines | /v1/aircraft` with `q`, entity filters, `limit` (max 100), `offset`.
Airport fields: `ident, iata, icao, name, municipality, country, latitude, longitude, elevation_ft, type, continent, iso_region, scheduled_service, gps_code, local_code, home_link, wikipedia_link, keywords, is_sample` (filters: `ident, iata, icao, country, type, continent, iso_region, scheduled_service`; `q` searches name, municipality, codes and keywords). `city` was renamed to `municipality`.
Airline fields: `ident, name, iata, icao, callsign, country, country_code, active, major, is_sample, hubs` (filters: `ident, iata, icao, country, country_code, active, major, hub`).
Aircraft fields: `ident, icao, iata, family, name, short_name, alternate_names[], manufacturer, engine_count, engine_type, aircraft_type, in_production, status, major, cargo, military, wiki_link, is_primary, wake_category, is_sample` (filters: `ident, icao, iata, family, manufacturer, engine_type, aircraft_type, status, in_production, major, cargo, military, is_primary`). One ICAO code can cover several variants; `is_primary` marks the main one.

Load the real lists into Supabase with `npx tsx scripts/import-source-data.ts` (upserts `data/airlines/airlines_full.csv` `data/aircraft_types/aircraft.csv` and `data/temp_data/airports.csv` (OurAirports) on `ident`; `--dry-run` to validate only, `--only=airports` to limit tables). `airline_hubs` has no real source yet and is not imported.
Auth header `x-api-key`. Responses include `meta.data_version` and the `x-data-version` header, plus `x-ratelimit-*` headers.
See `/docs` or `web/openapi.yaml`.

## Deployment (planned)
Hostinger Node.js hosting runs `npm run build && npm run start -w web`. Supabase provides Postgres, Auth (signup/login) and Storage (downloads).
Set the env vars from `.env.example`. `/get-key` issues an API key from just an email and a name: a Cloudflare Turnstile widget (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`) is verified server-side against siteverify with `TURNSTILE_SECRET_KEY` in `POST /api/keys`, the plaintext key is returned once, and only its peppered hash is stored (max 3 active keys per email). Signup and login use Supabase Auth (cookie session). The dashboard stores only a peppered hash of each API key. With `AVGEEKDB_MOCK=false`, `/v1` checks that hash in `api_keys`. Entity rows still come from the CSV snapshot until a Supabase data source is connected.

## License
- **Code:** MIT (see `LICENSE`).
- **Data: TODO.** Recommendation, depending on sources:
  - If any source is **ODbL** (e.g. OpenStreetMap-derived) or we want share-alike for the database, use **ODbL 1.0**. It's required for OSM derivatives and keeps improvements open.
  - If all sources are public domain / CC0 / CC BY (e.g. OurAirports is public domain, FAA data is US government), use **CC BY 4.0**. It's simpler for API consumers and only requires attribution.
  - Default lean: **CC BY 4.0**, unless an ODbL source is included.
