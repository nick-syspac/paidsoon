# CommitGuard task 9.5 — source-reviewed rollout checklist

Date: 2026-10-20. Change: `fix-commitguard-cash-protection-workflows`.
**LOCAL SOURCE REVIEW COMPLETE / UNMERGED / NOT DEPLOYED. Target review pending.**

## Decision and authorization boundary

**HOLD — no shared SQL, deployment or scheduler activation authorized.** This
checklist is reviewed against the active design, repository SQL, worker and
verification evidence. The 2026-10-20 acceptance review finds task 9.5's checklist
deliverable met, not its future execution gates satisfied. In particular, the
checklist requires actual-target inventory and exact predecessor/order sign-off
before any application; its repository sequence is not a verified target order.
No claim is made that the actual shared target has been inspected. Its migration ledger,
pending migrations, policies, role inheritance, default privileges, live data
and scheduler ownership **have not been queried in this documentation pass**.
No target/environment/project identity or list of target-pending migrations is
invented. A named operator, reviewer, target identity, approved artifact hashes,
execution window and separate written authorization are required before action.

The new targeted CashPlan policies are **approved local source and isolated-test
work only**; that approval is not permission to apply them on a shared target.
Completing this checklist task does not complete target review, SQL application,
release approval, scheduler ownership confirmation or scheduler activation. Those
are explicit separately authorized gates below, not waived acceptance criteria.

## 1. Evidence review and non-waivable stops

| Gate | Evidence and current disposition |
| --- | --- |
| Full local verification, task 9.1 | [Recorded results](commitguard-task-9-1-verification-2026-10-19.md): 4093 Node tests passed, lint 0 errors/1 existing warning, Prisma valid. **48 baseline TypeScript diagnostics remain; unchanged before/after in that run. Production build is unresolved: offline Geist and Geist Mono downloads failed before later build stages.** Neither clean TypeScript nor a complete build is certified. |
| Isolated storage, task 9.2 | [Recorded results](commitguard-task-9-2-verification-2026-10-19.md): additive migration replay, 345 storage tests, 392 focused mocked tests, 53 raw CashPlan role probes; target-only policy reapplication and unrelated baseline preservation. Local evidence only, not deployed RLS/effective-access acceptance. |
| Synthetic browser, task 9.3 | [Main browser report](commitguard-task-9-3-verification-2026-10-20.md): reviewed 349-assertion synthetic acceptance using real React/Tailwind, actual handlers/services and tenant PostgreSQL transactions; cleanup confirmed. Cookie-bound synthetic `getUser()`, router adapter, no Next RSC/real Supabase session. Environment-specific acceptance remains pending. |
| Scheduled workflow/digest, task 9.4 | [Recorded results](commitguard-task-9-4-verification-2026-10-20.md): integrated local worker/job/evaluation and first mocked digest delivery pass; **same-period regeneration is blocked by P2002**. Twelve green tests include expected-error reproduction, not passing replay acceptance. Full-worker discovery also has an unrelated Python 3.9.6 HTTP-server import failure; declared Docker runtime is 3.12, not verified here. |
| Shared-target/order/owner sign-off | **Pending separate read-only inspection and authorization**. No source or scratch result establishes what is applied or pending on that target. |

### Confirmed 9.4 blocker — do not waive or silently widen scope

The [canonical digest child policies](../../prisma/rls-policies.sql#L1696-L1750)
define SELECT/INSERT/UPDATE but **no DELETE/ALL policy** for
`owners_digest_items`, `owners_digest_metrics`, `owners_digest_provider_runs`.
Their existing grants allow DELETE; a grant is not an RLS deletion policy.
The [replacement transaction](../../lib/ownersDigest/service.ts#L993-L1010)
calls `deleteMany` before replacement insertion. Authenticated deletion affects
zero rows, and the same stable item identity then raises **P2002**. The local
transaction rolls back, retains existing items/delivery and makes no second
mock transport call. The [mailer](../../lib/email/sendOwnersDigest.ts) generates
before checking its delivery key, so `already_sent` replay is not certified.

**Required separate approval:** scope and review any digest policy/runtime fix,
prove own-tenant child replacement, foreign/anonymous denial, atomic rollback and
same-period regeneration/replay with non-delivering transport. If approved, give
that fix its own exact artifact/order review. It is **not** included in the four
CommitGuard/CashPlan artifacts below. Do not add DELETE policies here, apply all
canonical SQL, bypass tenant RLS with an admin writer, swallow P2002, delete
history, or treat the expected-error test as a waiver. Keep rollout on HOLD until
the blocker is separately resolved and reviewed.

## 2. Actual-target inventory — prerequisite, not yet performed

Before any write, separately authorize private read-only inspection of the
identified shared target. Record, without credentials or customer payloads:

1. Environment-to-database/API/worker mapping, current app/worker release and
   immutable identity of the target being reviewed. Never infer Preview or
   production configuration from the local socket/template or existing Railway
   deployment of unrelated jobs.
2. Actual migration ledger: successful, failed and unfinished entries, checksums,
   repository differences and **every** target-pending predecessor by exact name.
   Resolve drift or failed history before constructing the target execution plan.
3. Schema/index/FK/CHECK validation state and preflight uniqueness/invalid-row
   counts; review lock duration and RESTRICT inverse-FK/profile-erasure effects.
   Capture private rollback/recovery references before any authorized application.
4. Effective table/column ACLs, RLS policies (including permissive ALL policies),
   role inheritance and default privileges. Preserve profile billing columns,
   trial grants/operations/notifications/risks, customer mutation journals/steps,
   reservations and effective-access inputs. Do not activate unrelated restrictions.
5. Existing data compatibility and legacy-link ambiguity counts using reviewed
   read-only tooling. Missing balance/currency/expense attestation is unknown,
   not AUD or zero. Reconciliation uses unique tenant-matching audit proof only;
   a dry-run report does not authorize mass backfill, merging or deletion.

### Exact repository predecessor sequence — NOT a target-pending list

These are the relevant trailing migration directories in local repository order.
**Application status on the shared target is unknown for every row.** Earlier
target-pending history, if any, must also be reviewed; this is not an exhaustive
claim about the target ledger.

| Order | Exact repository migration | Required review |
| --- | --- | --- |
| Predecessor 1 | [20261014093943_add_superuser_tenant_trial_access](../../prisma/migrations/20261014093943_add_superuser_tenant_trial_access/migration.sql) | Trial schema is separate scope; verify actual ledger and existing containment. Local historical application is not target approval. |
| Predecessor 2 | [20261015060205_add_billing_webhook_processing_lease](../../prisma/migrations/20261015060205_add_billing_webhook_processing_lease/migration.sql) | Separate webhook lease scope; no authorization inferred from CommitGuard. |
| Predecessor 3 | [20261015095612_add_tenant_billing_mutation_journal](../../prisma/migrations/20261015095612_add_tenant_billing_mutation_journal/migration.sql) | Separate customer journal scope; preserve journals/reservations and access behavior. |
| CommitGuard | [20261018111014_fix_commitguard_cash_protection_workflows](../../prisma/migrations/20261018111014_fix_commitguard_cash_protection_workflows/migration.sql) | Reviewed additive change only, after target-specific predecessor resolution. |

If an unapproved predecessor is pending, stop for its owner/reviewer; do not
blindly deploy it, skip it, rewrite migration history or invent a workaround.
There is **no blanket `prisma migrate deploy` approval**. Never run
`migrate dev --create-only` on a shared database: it can apply pending predecessors.

## 3. Required SQL order after target-specific authorization

This is the source-backed order to use when preparing the actual target plan,
not an assertion that it has been executed. Application and scheduler activation
need distinct authorization. All four artifacts require target review.

| Step | Exact artifact | Application/review requirements |
| --- | --- | --- |
| A | [Additive CommitGuard migration](../../prisma/migrations/20261018111014_fix_commitguard_cash_protection_workflows/migration.sql) | After all actual-target predecessor decisions: four new tables, 26 existing-table columns, 19 catalog indexes including primary keys, eight RESTRICT FKs. Preserve nullable legacy provenance and version-1 history; no guessed cash, currency or conversion backfill. |
| B | [CommitGuard supplemental constraints](../../prisma/commitguard-constraints.sql) | After A, apply the **entire existing transaction once**. It contains 23 validated CHECKs, is not rerunnable and is outside Prisma tracking. If apparently already applied, verify exact names/definitions/validation flags first. Partial/duplicate/invalid state is a stop, not permission to drop constraints. |
| C | [Targeted CommitGuard policies/grants](../../prisma/rls-commitguard-policies.sql) | After B, execute atomically as schema owner. Only the four new tables; ten policies, RLS, table/column revocation and allowlists. Cash has no tenant DELETE; coverage has explicit tenant removal; work has safe reads/pending-only inserts, no tenant lifecycle writes; evaluation state is tenant-readable/system-write-only. |
| D | [New targeted CashPlan dependency](../../prisma/rls-cashplan-commitguard-policies.sql) | **After C**, execute atomically as schema owner. Only `cash_plans`, `cash_plan_overrides`, `cash_plan_snapshots`; five policies. Plans SELECT only; child SELECT and explicit-column INSERT through actual `plan_id` ownership; base snapshots require null scenario. No client plan creation, UPDATE/DELETE or reassignment. Approved locally only; shared application remains pending. |

Before exposing A's new tables, explicitly review target default grants and keep
application/Data API access unavailable across the schema/CHECK/policy gap. Do
not assume new tables are private merely because the feature dispatch gate is
off. Maintain approved access containment until both C and D and the target
probes succeed. Deploy all compatible nullable-v2 readers/services/forms and
bounded CashPlan consumers together only under a separately approved release.

Compare both targeted marked blocks with [canonical RLS](../../prisma/rls-policies.sql),
but **do not execute the entire canonical file**, unrelated trial/billing SQL or
test auth/legacy-policy scaffolding. D resets only its three target tables'
table/column client ACLs, preserves unrelated-operation policies, and aborts on
unknown overlapping SELECT/INSERT/ALL client policies; do not bypass that abort.
Inspect C's actual target policy set too: named-policy replacement is not a
blanket cleanup of unknown OR-capable policies.

After separately authorized application, compare before/after catalogs and ACLs
allowing only reviewed additions/target policy changes. Verify all 23 CHECKs,
same-tenant composite FKs, conversion uniqueness, raw-role tenant isolation,
protected work columns, system-only evaluation writes, CashPlan foreign-plan
denial and append-only snapshot behavior. Reapply only the repeatable targeted
policy artifacts in an approved isolated equivalent target, not B. Prove real
refresh/fenced publication and final-fence rollback without diagnostic grants.
Unexpected drift, permissions or invalid rows stop rollout. Do not claim the
local preservation checks establish shared trial/billing effective access.

## 4. One Railway owner — gate stays OFF

The current [code gate](../../worker/paidsoon_worker/config.py) is
`Config.COMMITGUARD_DISPATCH_ENABLED = False`; it is not an environment variable.
Leave it false. No Beat entry or scheduler is activated by this checklist.

Before any separately authorized activation, record one accountable operator
and **exactly one existing Railway Beat owner per database/environment**. Verify
the app/API URL, database mapping, worker release, Redis connectivity, internal
networking and existing `INTERNAL_JOBS_SECRET` distribution privately. Protected
Preview also needs its existing automation-bypass header. Add no new secret,
Vercel cron, second Beat replica, scheduler service or mail subscription.

The code gate only suppresses the Python dispatch extension; internal HTTP routes
are not gated by it. Do not make shared dispatch/repair/execution calls as a
"read-only check". They can write. Following SQL/security/blocker/build/main-review
sign-off, separately authorize controlled synthetic checks using non-delivering
mail transport, then any activation. Verify five-minute dispatch, one database-
UTC daily identity, unattended evaluation without page visits, lost-enqueue and
restart recovery, current-access revocation/disable and digest replay. Local
worker tests are not live wall-clock or delivery evidence. No immediate-email or
exactly-once transport guarantee is added.

## 5. Source repair, safe monitoring and retry

Use the [existing private operator procedures](../runbooks/commitguard.md#task-68-operator-procedures--unmerged--not-deployed).
This checklist adds no inspection endpoint, schema or runtime behavior.

| Operator review | Safe observations and action after separate authorization |
| --- | --- |
| Baseline and backlog | Record observation time; aggregate work counts by kind/state/attempts/safe code, oldest pending/requested age, overdue next-attempt age and missing/aged daily-success counts. Review baselines with the operator; no invented production thresholds or latency promises. |
| Bounded discovery | Enabled-tenant discovery, expired/pending-exhausted recovery and due-pending scan each cap at 100; repair independently caps 100 accounting sources and 100 batches. Redis is transient delivery, PostgreSQL is authoritative. Failed enqueue preserves discoverable pending work. |
| Source completion gaps | Accounting: success, nonnull completion, zero skipped invoices. Spreadsheet: completed, nonnull completion, zero failed/skipped rows. The daily paged repair pass and restart replay use canonical source keys; partial/failed sources are not automatically detected. Repair counts are pending requests, not financial execution. |
| Existing work and exhaustion | Any existing canonical work state/generation is not a gap. Do not recreate exhausted work. Claims use renewable 60-second matching-owner/fence leases; six attempts exhaust with bounded backoff and five-minute rediscovery. Recovery, not manual lease edits, owns expired processing. |
| Failed-generation retry | Address the cause, then use the existing elevated admin/owner retry route with observed expected generation. Preserve canonical source/dedupe/revision/fence and private attempt history. Worker bearer is insufficient; stale/nonfailed requests are 409. Pending retry is not execution or mail delivery. |

Diagnostics contain **counts, ages, attempts and fixed safe codes only**, not
cash balances, amounts, suppliers, commitment text, source payloads, recipients,
headers/cookies/secrets, raw provider/DB errors, lease owners/fences or private
attempt history. Keep routing identities in trusted private operations, not
public tickets/logs. An event/history row, repaired work, completed evaluation or
snapshot is not an email receipt. There is no new standalone sender.

## 6. Non-destructive rollback and stop conditions

On failed isolation, unexpected ACL/schema drift, stale-worker publication,
duplicate conversion/events, broken digest regeneration or incompatible readers:
stop further rollout and the authorized CommitGuard dispatch extension. Revoke
any separate manual dispatch authorization and let in-flight work settle/drain
under current lease/fence rules; verify privately before changing releases. Do
not stop unrelated schedules or assume flipping the Python gate cancels already
queued work or disables HTTP execution. Any temporary execution containment or
release change needs explicit operational review.

Retain additive schema, cash attestations, commitments, conversion identities,
coverage, work generations/attempt history, evaluation state, events and both
snapshot versions. Keep financial assertions unavailable where compatibility
cannot be established. An application fallback must understand nullable/v2
contracts and must **not** restore mixed-currency summation, fabricated zero cash
or GET-generated alerts. Retain reviewed security containment; do not restore
permissive ACLs as an expedient rollback.

No down migration, table/column drop, TRUNCATE, ledger deletion/merge, blind
backfill, migration-history rewrite, source-key rewrite, raw lease reset or
destructive data cleanup is authorized. Retention is the rollback strategy;
destructive remediation or historical reconciliation needs separate approval.

## Review hand-off

This acceptance review covers the source checklist, recorded isolated-storage
evidence and synthetic browser report, not target inspection or rollout execution.
The future target operator/reviewer must preserve the digest blocker and obtain
separate target-read, SQL-application, remediation, release and activation
authorizations as applicable. Task 9.5 records production of this reviewed,
explicitly gated checklist only. Actual-target inventory/order validation,
build/TypeScript and deployed acceptance remain outstanding. No runtime or
user-owned event-service edit is made by this review.
