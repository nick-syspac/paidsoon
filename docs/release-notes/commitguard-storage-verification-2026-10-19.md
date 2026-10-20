# CommitGuard task 1.6 — isolated storage verification, 2026-10-19

**UNMERGED / NOT DEPLOYED — storage implementation only.** Scope is task 1.6 of
`fix-commitguard-cash-protection-workflows`; tasks 1.1–1.5 were already complete.
No task checkboxes, runtime code, schema, SQL artifacts or historical migrations
were edited in this task. Only documentation and a narrow schema verifier were
added/updated. No shared database, real customer data, external financial API or
email transport was used.

## Commands and observed results

Commands run from the repository unless stated otherwise:

```sh
node --import tsx --test scripts/verify-rls-commitguard-constraints.ts scripts/verify-rls-commitguard-policies.ts
node scripts/verify-rls-commitguard-schema-baseline.mjs
node --import tsx --test tests/commitguard-legacy-conversion-report.test.ts
node_modules/.bin/eslint scripts/verify-rls-commitguard-schema-baseline.mjs
node_modules/.bin/tsc --noEmit --incremental false --pretty false
```

| Verification | Result / boundary |
| --- | --- |
| Existing CHECK + RLS verifiers | **257 passed, 0 failed** (127 CHECK, 130 RLS). All 23 declared CHECKs exist/are validated and each rejects an invalid fixture with the expected SQLSTATE/name. |
| Actual targeted ACL application | Applied twice inside a rollback transaction, ten policies; unrelated schema/table/column ACLs, policies, constraints, indexes, roles/memberships preserved both times. Full original catalog/auth setup and synthetic profile fixtures restored after rollback. |
| Second-DB schema replay | **PASS**: first 55 historical migrations followed by the generated CommitGuard migration; 116 pre-existing tables preserved except explicitly allowed additions/inverse FKs. Four new tables, 26 columns on existing tables, 19 indexes (15 explicit + four primary-key indexes), eight FKs. Historical SQL bytes unchanged; original cluster roles preserved. |
| Pure legacy conversion report | **29 passed, 0 failed**; unique, missing, duplicate and conflicting audit fixtures. No loader/backfill/write behavior inferred. |
| Focused ESLint | Exit 0, no diagnostics. |
| TypeScript before/after | Exit 2, **48 existing diagnostics**, identical before/after; not a clean project typecheck. |

The successful final replay database was `commitguard_baseline_1792357866039`
on PostgreSQL **17.11**, socket `/tmp/paidsoon-commitguard-pg.i62Iri`, port
`55437`, role `syspac`. Identity checks require `inet_server_addr() IS NULL` and
empty `listen_addresses` before any database/role DDL. Each schema-verifier run
creates a fresh disposable database there and leaves it for inspection; a failed
intermediate inventory assertion was corrected to distinguish index attributes
from table columns and count implicit primary-key indexes. No shared target or
historical migration was changed to resolve that verifier issue.

The verifier invokes this exact CLI shape with SQL on stdin, cwd `/tmp`, and a
minimal PATH/HOME/TMPDIR environment (no inherited DB variables):

```sh
npx --yes --package=prisma@6.19.0 prisma db execute --url 'postgresql://syspac@localhost:55437/commitguard_baseline_1792357866039?host=%2Ftmp%2Fpaidsoon-commitguard-pg.i62Iri' --stdin
```

It replays the 55 predecessor SQL files in one transaction, captures a logical
catalog, applies the new generated SQL in another transaction and compares.
This is SQL replay via `db execute`, **not** migrate-deploy or a claim that the
target Prisma migration ledger was inspected. Prisma 6.19.0 is a pinned,
verification-only external CLI because installed Prisma 7 has removed the
explicit `--url` option; no project dependency/config changed. Help inspection
of installed Prisma 7 loaded local config but executed no SQL; all database
execution used explicit scratch clients/URLs only.

New migration SHA-256:
`37d9b04ac63a1d53175c246aca7478dec1fe2163b5e908e406ab9ed843ec968e`.
Before and projected-after logical catalog SHA-256 both:
`8dc5f11388d6bc18a87b5bf3996e2311d23c2a111bdfc9db6ad4b879c62aaee3`.
The projection removes only allowlisted additions, including FK triggers on
referenced tables. Everything else must deep-equal the baseline: relation
ownership/table ACL/RLS flags, existing column types/defaults/ACLs, constraints,
indexes/triggers, policies, roles/memberships, schemas, default ACLs, public/auth
functions and existing types. Physical statistics/OIDs for newly added objects
are not used as logical schema equivalence evidence.

## Persistence and ACL-baseline limits

- Original `commitguard` scratch retains the previously applied **23 CHECKs**.
  This run omitted `--apply`: it verified existing persistent CHECKs and rolled
  back fixtures; it did not attempt duplicate CHECK creation.
- RLS verification actually applied the standalone policy file twice, simulating
  broad Supabase defaults and stale column grants, then rolled it back. The
  application baseline is captured **after** temporary legacy-policy/auth test
  setup; original-catalog equality is separately asserted after rollback.
- The RLS verifier's missing `auth.uid()`/schema/grants and any missing roles
  are scratch-only temporary scaffolding. Existing `authenticated`/`anon` roles
  were NOLOGIN/NOSUPERUSER/NOBYPASSRLS. After execution, original scratch had
  zero policies on the four new tables and no `auth.uid()` function. Thus
  passing probes do **not** mean policies were deployed, even to scratch.
- The second schema database has no supplemental CHECK/RLS application. Its
  historical migrations include two spend-insight column grants. The verifier
  reuses the existing local `authenticated` role (or temporarily creates/removes
  it if absent) and asserts cluster roles are restored. It neither copies nor
  represents a deployed Supabase ACL configuration.
- Preserved tables include `tenant_trial_grants`, `tenant_trial_operations`,
  `tenant_trial_notifications`, `tenant_billing_risks`, `tenant_billing_mutations`,
  `tenant_billing_mutation_steps`, `stripe_billing_webhook_events` and
  `user_profiles` (including reservation/effective-access columns/permissions).
  Catalog equality is not a behavioral test of the effective-access resolver,
  billing saga, trial journal or actual target permissions.

## Existing TypeScript baseline and deferred gates

The 48 diagnostics comprise 22 generated development-route diagnostics, five
accounting-trigger-sync fixture diagnostics, 16 DepositGuard fixture diagnostics,
four SpendLeak evidence diagnostics and one trial-access E2E-plan diagnostic.
Before/after output was compared byte-for-byte; no new diagnostic was accepted
as part of this task. Full suite/build/browser acceptance were not run for this
documentation/storage-baseline task and are not claimed complete.

No blanket deploy: inspect the actual target's pending trial schema, webhook
lease and customer-journal predecessors and existing ACL baseline first. The
reviewed sequence is generated CommitGuard migration → supplemental CHECK
transaction **once** → targeted CommitGuard policies atomically, never the full
canonical RLS or unrelated trial/billing supplemental SQL. See the
[ordered review gate](../runbooks/commitguard.md#52-ordered-review-gate--not-authorization-to-deploy)
and [schema/ACL inventory](../DDD.md#631-commitguard-cash-protection-storage).

Still pending: task 3.6 tenant-locked aggregate coverage caps; explicit-select
work callers (ORM return-all is denied); authorized legacy DB loader/backfill;
atomic conversion/allowance enforcement; cash services/forms; trusted fenced
jobs and repair; consistent version-2 consumers; actual-target permission and
synthetic end-to-end acceptance. No scheduler, provider-balance sync, standalone
mail or guaranteed immediate delivery is enabled or proven here.