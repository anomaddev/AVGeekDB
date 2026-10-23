# AVGeekDB

Open, easy-to-use data for **aircraft types, airlines and airports**: downloadable dumps (CSV / JSON / SQLite) plus a free API (API key required).

> ⚠️ **Scaffold only.** `data/` holds 3 clearly marked SAMPLE rows per entity (`is_sample=true`). Real sources TBD.

## Layout
```
data/            canonical CSV per entity + VERSION (dataset version) + LICENSE.md (TODO)
schema/          JSON Schema per entity (placeholder fields)
scripts/         build-data.ts (validate -> dist/{csv,json}, avgeekdb.sqlite, manifest.json)
                 upload-to-storage.ts (STUB: publish dist/ to Supabase Storage)
api/             @avgeekdb/api: shared logic (key hashing/verify, per-key rate limit, query handler, data version)
web/             Next.js 16 app: landing, /docs, /downloads, /signup, /login, /dashboard, /contribute, /admin, public API /v1/*
web/openapi.yaml OpenAPI 3.1 spec (also served at /openapi.yaml)
supabase/        migrations/ (Postgres schema + RLS) and seed.sql (sample rows)
docs/ci-drafts/  GitHub Actions workflow draft (move to .github/workflows/)
```

## Quick start
```bash
npm install
npm run build                   # data build + Next build, no Supabase needed (AVGEEKDB_MOCK defaults to true)
npm run dev -w web
curl -H "x-api-key: avg_demo_0000000000000000000000000000" "localhost:3000/v1/airports?q=heathrow"
```

## API
`GET /v1/airports | /v1/airlines | /v1/aircraft` with `q`, entity filters, `limit` (max 100), `offset`.
Auth header `x-api-key`. Responses include `meta.data_version` and the `x-data-version` header, plus `x-ratelimit-*` headers.
See `/docs` or `web/openapi.yaml`.

## Deployment (planned)
Hostinger Node.js hosting runs `npm run build && npm run start -w web`. Supabase provides Postgres, Auth (signup/login) and Storage (downloads).
Set the env vars from `.env.example` and `AVGEEKDB_MOCK=false` once the Supabase-backed key store and data source are implemented.

## License
- **Code:** MIT (see `LICENSE`).
- **Data: TODO.** Recommendation, depending on sources:
  - If any source is **ODbL** (e.g. OpenStreetMap-derived) or we want share-alike for the database, use **ODbL 1.0**. It's required for OSM derivatives and keeps improvements open.
  - If all sources are public domain / CC0 / CC BY (e.g. OurAirports is public domain, FAA data is US government), use **CC BY 4.0**. It's simpler for API consumers and only requires attribution.
  - Default lean: **CC BY 4.0**, unless an ODbL source is included.
