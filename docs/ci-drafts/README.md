Workflow drafts live here because the scaffold was pushed with a token lacking the `workflow` scope.

| Draft | Purpose |
|---|---|
| `ci.yml` | PR/push: JSON Schema check of `data/`, then lint, typecheck, test, build |
| `data-snapshot.yml` | Weekly + manual: export Supabase (source of truth) → `data/`, validate, open a dated PR |

To enable: `mkdir -p .github/workflows && git mv docs/ci-drafts/*.yml .github/workflows/`.
`data-snapshot.yml` needs repo secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and "Allow GitHub Actions to create pull requests" enabled.
