# Contributing

## Setup
```bash
npm install
cp .env.example .env.local   # mock mode works with no Supabase
npm run data:build           # validate data/ + emit dist/
npm run dev -w web           # http://localhost:3000
```
Before a PR: `npm run lint && npm run typecheck && npm test && npm run build`.

## Data changes
Supabase is the source of truth; `data/` is overwritten by the weekly snapshot. Prefer corrections via the site's Contribute form (reviewed by editors). CSV PRs are for bootstrapping only.
- Edit `data/<entity>/<entity>.csv`. Every row must validate against `schema/<entity>.schema.json` (`npm run data:build` fails otherwise).
- That build rewrites `data/<entity>/<entity>.json` and `data/avgeekdb.sqlite`. Commit those files with the CSV change. Do not edit them by hand.
- `data/aircraft_types/aircraft.csv` is the verified wide-format type list, with `changes.csv` and `flags.csv` beside it. It is not validated against `schema/aircraft_types.schema.json` and the API does not load it. Do not replace `aircraft_types.csv` with it.
- `data/airlines/airlines_full.csv` is the verified airline list, with `changes.csv` and `flags.csv` beside it. It is not validated against `schema/airlines.schema.json` and the API does not load it. Do not replace `airlines.csv` with it.
- Cite a source for every change in the PR. Only add data whose license is compatible with the project data license.
- Bump `data/VERSION` (format `YYYY.MM.DD`) when publishing a release.
- Schema changes need a matching migration in `supabase/migrations/`.

## Code
TypeScript, strict. Shared API logic goes in `api/`; `web/` route handlers stay thin.
