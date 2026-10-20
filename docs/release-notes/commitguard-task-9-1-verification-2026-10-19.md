# CommitGuard task 9.1 — cross-cutting local verification

Date: 2026-10-19. **LOCAL / UNMERGED / NOT DEPLOYED.**

## Scope and verdict

Only verification task **9.1** of `fix-commitguard-cash-protection-workflows`
was executed. The active proposal, design, ten delta specifications, task list,
testing/Vercel/documentation instructions, package scripts, Prisma/Next
configuration and relevant static-generation paths were read before execution.

**Not an all-green acceptance:** the complete configured Node suite, full lint
and offline Prisma validation passed. Standalone TypeScript still fails with
the existing **48 diagnostics**. The actual unchanged production build was
attempted and **failed on two Google Fonts downloads blocked by offline
containment**. No successful compilation, build TypeScript phase, static-page
generation or deployability is claimed.

No task checkbox was changed; progress remains **49/54**. Tasks 9.2–9.5 were
not executed. No shared SQL, migration, grant/policy application, scheduler
activation, deployment or commit was performed. No product, test, configuration,
schema or existing documentation file was edited for this task; this report is
the only repository addition. Generated ignored output was allowed to refresh.

## Environment and enforced isolation

- macOS; installed Node **26.10.0**, npm **11.19.1**, Next **16.2.9**,
  TypeScript **5.9.3**, ESLint **9.39.4**, Prisma CLI **7.10.0**.
  The installed `@prisma/client` package reported **7.8.0** before the run;
  generation reported Prisma Client **7.10.0**. No dependencies were installed
  or upgraded. The declared Node engine is **24.x**; this is not supported-engine
  CI certification.
- An external temporary runner constructed an allowlisted child environment
  instead of inheriting shell/service credentials. Only PATH, HOME and TMPDIR
  were retained from the shell. Synthetic canonical Supabase ref/password and
  dummy publishable/admin/Stripe/Resend values were supplied; no real credential
  was read, printed or used. Compatibility database URLs were not externally
  supplied; the existing canonical adapter remained authoritative.
- A preload returned empty contents for repository-root dotenv files through
  synchronous, callback and promise `readFile` APIs. The macOS sandbox separately
  denied reading repository-root dotenv contents, including from native code
  and subprocesses. No environment file was renamed, edited or removed.
  A direct `openSync` probe against the local dotenv file returned **EPERM**
  without reading its contents. Prisma reported **zero injected values** for
  both dotenv loads. Next still listed the existing dotenv filename; that
  filename listing is not evidence that its contents were available.
- Every verification phase ran under `sandbox-exec`: outbound network denied,
  local Unix sockets/loopback permitted for tooling, and loopback PostgreSQL
  ports **5432/6543 explicitly denied**. A native curl connection probe to a
  reserved TEST-NET address exited **7**. The sandbox restrictions were inherited
  by subprocesses, including tests that deliberately construct a new environment.
- The inherited Node preload also rejected socket/DNS/HTTP(S)/fetch/UDP calls;
  only build-local non-database IPC was permitted. **Zero Node network-denial
  markers** were recorded. This is not a zero-network-attempt claim: Turbopack's
  native font transport attempted downloads and failed under OS containment.
  No external database, provider API or email delivery was used by the unit suite.
- Tests used an empty app URL and existing admin-test defaults (five failed
  attempts, 120-second challenge TTL); build used a synthetic HTTPS app URL and
  `NODE_ENV=production`. Telemetry/version checks were disabled and npm was
  offline. No font mocking, source replacement or type-error suppression was used.

The build was run in the existing workspace/cache state. No pre-existing Next
cache/dev types were manually deleted, hidden or excluded to manufacture a pass.

## Build-time data-access inspection

| Surface | Verified boundary |
| --- | --- |
| [Root layout](../../app/layout.tsx) | Imports `Geist` and `Geist_Mono` using `next/font/google`; these require network-sensitive build downloads. |
| [Blog static parameters](../../app/%28marketing%29/blog/[slug]/page.tsx), [feature static parameters](../../app/%28marketing%29/features/[slug]/page.tsx), [integration static parameters](../../app/%28marketing%29/integrations/[integrationId]/page.tsx), [sitemap](../../app/sitemap.ts) | Local content/catalog-based generation, not a reason to permit external service access. |
| [Help page](../../app/%28marketing%29/help/[[...slug]]/page.tsx) | Can query platform training data through `prismaAdmin`; first invokes the request-cookie Supabase server client. Not assumed database-free. |
| [Dashboard layout](../../app/dashboard/layout.tsx) | Reads request headers/auth before user data. |
| [Deposit token page](../../app/pay/deposit/[token]/page.tsx), [promise token page](../../app/promise/[token]/page.tsx) | Deposit explicitly force-dynamic; promise imports Prisma. Neither was trusted as safe merely because it is a page/GET. |
| [Prisma configuration](../../prisma.config.ts), [Next configuration](../../next.config.ts) | Prisma generate-only mode uses its existing dummy datasource; Next materializes canonical public configuration. Both dotenv loaders remained contained. |

These inspections are precautionary source evidence, not completed prerender
proof. The build failed during optimized compilation before static-page generation.

## Commands and exact results

Each command below was invoked through the temporary runner as
`node /tmp/paidsoon-91-verification/runner.cjs <phase>`. Its child command ran
under the isolation above, not directly with the ambient shell environment.

| Phase | Actual child command | Exit | Result | Seconds |
| --- | --- | ---: | --- | ---: |
| `tsc-before` | `npx --no-install tsc --noEmit --pretty false --incremental false` | 2 | **48 baseline diagnostics**: 22 generated Next dev, 26 existing test diagnostics | 8.074 |
| `test` | `npm run test` | 0 | **4093 passed / 319 suites**, 0 failed/cancelled/skipped/todo | 13.213 |
| `lint` | `npm run lint` | 0 | Full repository ESLint: **0 errors, 1 existing warning** | 13.659 |
| `prisma` | `PRISMA_GENERATE_ONLY=true npx --no-install prisma validate` | 0 | Current canonical schema valid; no database connection | 0.671 |
| `build` | `npm run build` | 1 | Existing `npm run prisma:generate && next build`; generation passed, **two font fetch errors** | 8.902 |
| `tsc-after` | `npx --no-install tsc --noEmit --pretty false --incremental false` | 2 | Same **48**, byte-for-byte identical to this run's before log | 8.709 |

The build invoked the unmodified `prisma:generate` script:
`PRISMA_GENERATE_ONLY=true prisma generate`. It generated Client 7.10.0
successfully, then Next/Turbopack failed to fetch **Geist** and **Geist Mono**
from Google Fonts. The import traces end at the existing root layout. This is
an offline-environment blocker, not evidence of a CommitGuard compiler error;
later build stages remain **unverified**, not implicitly passing. No relaxed
network/font-mocked retry was performed.

The configured Node script is
`SUPABASE_PROJECT_REF=abcdefghijklmnopqrst SUPABASE_DB_PASSWORD=test-only-password node --experimental-test-module-mocks --import tsx --test tests/**/*.test.ts`.
Its **287** matching test files ran. The three existing TSX test files are not
selected by that script: [email settings](../../tests/email-settings-client.test.tsx),
[SpendLeak evidence](../../tests/spendleak-evidence-details.test.tsx) and
[template guardrails](../../tests/templates-client-ai-guardrails.test.tsx).
They remain included in standalone TypeScript. No coverage-percentage claim,
Python-worker run, authenticated browser run, live RLS/concurrency validation
or scheduled-delivery acceptance is implied.

Full lint's existing warning is unused `isVisible` in
[settings navigation](../../lib/settings/navigation.ts#L76).
Experimental/deprecated module-mocking warnings and build deprecation `DEP0205`
were non-fatal and were not suppressed.

## TypeScript baseline comparison

| Existing diagnostic group | Count |
| --- | ---: |
| Generated Next development references to 11 former marketing pages: TS2307 | 22 |
| [Accounting trigger-sync fixtures](../../tests/accounting-trigger-sync.test.ts): TS2322/TS2339 | 5 |
| DepositGuard route/page/webhook mock options: TS2353 unsupported `exports` | 13 |
| DepositGuard public requests/reminder delivery: TS2578 unused expect-error | 3 |
| [SpendLeak evidence TSX](../../tests/spendleak-evidence-details.test.tsx): TS2339/TS2322/TS2783 | 4 |
| [Trial E2E plan](../../tests/trial-access-e2e-plan.test.ts): TS2769, missing required `NODE_ENV` in subprocess fixture | 1 |
| **Total** | **48** |

All 26 non-generated diagnostics are in existing tests, not new application/lib
source. The fresh before/after logs are byte-identical, SHA-256:
`4a12f251c6a1ff2094df3be7ac49a73cffcb6f29e1997a03b9a2b0a5106c2af9`.

The immediately preceding task-8.5 before log has SHA-256
`7bd52763bac44a8df11492fb09ab960e44c3280eadae6ad2c902071b622181e6`.
Direct diff found only string-union display ordering in one accounting message
and generated object-property display ordering in two SpendLeak messages.
Diagnostic locations, codes, failure causes and counts are unchanged. Those
presentation differences are not new failures. No unrelated diagnostic was
fixed, suppressed or removed. The failed build did not clean the **22** stale
generated-dev diagnostics; the baseline remains **48**, not 26 or zero.

## Evidence retention and source preservation

Execution began **2026-10-19T10:30:42.199Z**; the build began
**10:31:29.978Z**; final TypeScript began **10:31:39.032Z**.

Temporary evidence directory: `/tmp/paidsoon-91-verification/`. It contains
`runner.cjs`, `guard.cjs`, `results.jsonl`, the six phase logs named above and
`source-before.json`. These are local verification artifacts, not production
credentials or committed executable tooling. The prior task-8.5 baseline remains
at `/tmp/paidsoon-85-tsc-before.log`. Temporary logs may not survive cleanup;
this report retains the results and failure classification.

SHA-256 snapshots of **2417 pre-existing nonignored source files** before and
after verification found **zero changed files**. This includes the active task
list, all existing modified/untracked feature sources and package/build configs.
Generated ignored Prisma/Next/MDX output is outside that preservation claim.

Additional checks: `git diff --check` passed, and
`openspec validate fix-commitguard-cash-protection-workflows --type change --strict`
passed. No baseline reset, schema/SQL application or rollout authorization was
inferred from these results. Task 9.1 remains unchecked as explicitly requested;
all-green TypeScript and a complete production build remain outstanding.
