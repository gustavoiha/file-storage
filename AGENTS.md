# Repository Pattern (AWS Monorepo)

- Root: npm workspaces = `apps/*`, `packages/*`, `infra/*`; root scripts orchestrate all packages: `build`, `test`, `typecheck`.
- `apps/web`: frontend + `.env.example` and `.env.dev/.env.prod`; `scripts/deploy.sh` handles build, S3 sync, CloudFront invalidation.
- `packages/backend`: keep Lambdas thin in `src/handlers` (one handler per route/use-case); shared logic in `src/lib`; core rules in `src/domain`; triggers in `src/triggers`; operational jobs in `src/scripts`; tests in `src/tests`.
- `infra/cdk`: stacks split by responsibility (`identity`, `storage`, `backend`, `frontend`); env-driven bootstrap in `src/app.ts`; deployment via `scripts/deploy.sh <env-file>`.
- Deploy scripts: always `set -euo pipefail`, fail fast with clear messages, and keep safe defaults.
- Env model: each deployable unit has `.env.example`; real envs are stage-specific (`dev`, `prod`); select AWS account with `AWS_PROFILE`; keep naming consistent so stack outputs flow into app envs.
