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
Supabase is the source of truth. Prefer corrections via the site's Contribute form (reviewed by editors). CSV PRs are for bootstrapping the API datasets only.
- Edit `data/<entity>/<entity>.csv`. Every row must validate against `schema/<entity>.schema.json` (`npm run data:build` fails otherwise).
- That build rewrites `data/<entity>/<entity>.json`. Commit those files with the CSV change. Do not edit them by hand. It does not rewrite `data/avgeekdb.sqlite`.
- `data/aircraft_types/aircraft.csv` is the verified wide-format type list, with `changes.csv` and `flags.csv` beside it. It is not validated against `schema/aircraft_types.schema.json` and the API does not load it. Do not replace `aircraft_types.csv` with it.
- `data/airlines/airlines_full.csv` is the verified airline list, with `changes.csv` and `flags.csv` beside it. It is not validated against `schema/airlines.schema.json` and the API does not load it. Do not replace `airlines.csv` with it.
- Cite a source for every change in the PR. Only add data whose license is compatible with the project data license.
- Bump `data/VERSION` (format `YYYY.MM.DD`) when the CSV snapshot's dataset version changes.
- Schema changes need a matching migration in `supabase/migrations/`.

## SQLite dump
`data/avgeekdb.sqlite` is a direct dump of the Supabase reference tables (`npm run data:sqlite`), with Postgres column names. It is not built from the CSVs. API keys, usage, roles, submissions, and the change log are left out. The `meta` table stores `api_version`, `data_version`, and `generated_at`.

Refresh it without bumping the API version by running the **SQLite refresh** workflow (`workflow_dispatch`). That opens a pull request containing only `data/avgeekdb.sqlite`. An API release dumps the same file.

## Releasing the API
The API semver lives in `api/src/version.ts`. `npm run version:set -- X.Y.Z` writes it into the root, `api`, and `web` `package.json` files, `package-lock.json`, and both OpenAPI specs. Do not hand-edit those copies. `/v1` stays until a breaking change.

The **Release** workflow (`workflow_dispatch`, semver input without a leading `v`) runs `version:set`, dumps SQLite from Supabase, and opens a pull request titled `release: vX.Y.Z`. Squash-merge that pull request so the commit subject stays `release: vX.Y.Z`. The push to `main` tags `vX.Y.Z` and attaches `avgeekdb-X.Y.Z.sqlite` to the GitHub Release.

Both workflows need repo secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and Actions must be allowed to open pull requests. There is no schedule.

## Code
TypeScript, strict. Shared API logic goes in `api/`; `web/` route handlers stay thin.
