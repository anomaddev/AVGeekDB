The CI workflow draft lives here because the scaffold was pushed with a token lacking the `workflow` scope.

| Draft | Purpose |
|---|---|
| `ci.yml` | PR/push: JSON Schema check of `data/`, then lint, typecheck, test, build |

SQLite refresh and API release run from `.github/workflows/`. They are manual (`workflow_dispatch`). There is no weekly snapshot.

To enable CI: `mkdir -p .github/workflows && git mv docs/ci-drafts/ci.yml .github/workflows/`.
