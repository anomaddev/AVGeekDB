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
- Edit `data/<entity>/<entity>.csv`. Every row must validate against `schema/<entity>.schema.json` (`npm run data:build` fails otherwise).
- Cite a source for every change in the PR. Only add data whose license is compatible with the project data license.
- Bump `data/VERSION` (format `YYYY.MM.DD`) when publishing a release.
- Schema changes need a matching migration in `supabase/migrations/`.

## Code
TypeScript, strict. Shared API logic goes in `api/`; `web/` route handlers stay thin.
