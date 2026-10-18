import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { createTrialE2EPlan, TrialE2EPlanError } from "@/tests/helpers/trialAccessE2EPlan"

// Synthetic strings only. No fixture, SDK, dotenv or database is loaded.
const input = {
  projectRef: "zzzzzzzzzzzzzzzzzzzz",
  reviewedProjectRef: "zzzzzzzzzzzzzzzzzzzz",
  sharedProjectRefs: { development: "dddddddddddddddddddd", production: "pppppppppppppppppppp" },
  disposable: true,
  reviewId: "offline-review-example",
  runId: "00000000-0000-4000-8000-000000000094",
  port: 4409,
}

function rejects(value: unknown, code: string): void {
  assert.throws(() => createTrialE2EPlan(value), (error: unknown) =>
    error instanceof TrialE2EPlanError && error.code === code && error.message === code)
}

test("a valid offline plan remains blocked, immutable and explicitly not E2E", () => {
  const plan = createTrialE2EPlan(input)
  assert.equal(plan.launchAllowed, false)
  assert.equal(plan.task94Complete, false)
  assert.equal(plan.kind, "offline-launch-plan-only")
  assert.deepEqual(plan.target, { projectRef: input.projectRef, reviewId: input.reviewId, runId: input.runId })
  assert.equal(plan.next.hostname, "127.0.0.1")
  assert.equal(plan.next.environment, "explicit-allowlist-no-inheritance")
  assert.equal(plan.next.workspace, "external-disposable-copy-without-dotenv")
  assert.equal(plan.next.authorization, "real-auth-role-device-signed-challenge")
  assert.equal(plan.next.providers, "server-side-stripe-resend-stubs-required")
  assert.equal(plan.blockers.length, 6)
  for (const part of [plan, plan.target, plan.next, plan.blockers]) assert.ok(Object.isFrozen(part))
})

for (const field of Object.keys(input)) {
  test(`requires explicit ${field}; no ambient fallback`, () => {
    const value: Record<string, unknown> = { ...input }
    delete value[field]
    rejects(value, "invalid_manifest")
  })
}

for (const projectRef of ["", " ", "Z".repeat(20), "z".repeat(19), "z".repeat(21), "https://example.supabase.co", "../../.env.local"]) {
  test(`rejects malformed target ${JSON.stringify(projectRef)}`, () => {
    rejects({ ...input, projectRef }, "invalid_manifest")
  })
}

test("requires exact reviewed target and explicit disposable acknowledgement", () => {
  rejects({ ...input, reviewedProjectRef: "rrrrrrrrrrrrrrrrrrrr" }, "unreviewed_target")
  for (const disposable of [false, "true", null]) rejects({ ...input, disposable }, "invalid_manifest")
})

test("rejects either shared target even if reviewed/disposable is asserted", () => {
  for (const projectRef of Object.values(input.sharedProjectRefs)) {
    rejects({ ...input, projectRef, reviewedProjectRef: projectRef }, "shared_target")
  }
})

test("refuses runbook placeholder; no usable default target", () => {
  rejects({ ...input, projectRef: "abcdefghijklmnopqrst", reviewedProjectRef: "abcdefghijklmnopqrst" }, "placeholder_target")
})

test("requires both shared identities and rejects unknown nested controls", () => {
  rejects({ ...input, sharedProjectRefs: {} }, "invalid_manifest")
  rejects({ ...input, sharedProjectRefs: { ...input.sharedProjectRefs, bypass: true } }, "invalid_manifest")
})

test("rejects credentials, dotenv paths, provider URLs and auth bypass switches", () => {
  for (const field of ["SUPABASE_DB_PASSWORD", "SUPABASE_SECRET_KEY", "DATABASE_URL", "envFile", "NODE_OPTIONS", "ADMIN_REQUIRE_DEVICE_KEY", "authBypass", "stripeUrl", "resendUrl"]) {
    rejects({ ...input, [field]: "must-not-be-echoed" }, "invalid_manifest")
  }
})

test("rejects unsafe ports, review identifiers and non-UUID run identity", () => {
  for (const port of [0, 80, 1023, 65536, 4409.5, "4409"]) rejects({ ...input, port }, "invalid_manifest")
  for (const reviewId of ["", " ", "review\nsecret", "x".repeat(101)]) rejects({ ...input, reviewId }, "invalid_manifest")
  rejects({ ...input, runId: "run" }, "invalid_manifest")
})

const root = fileURLToPath(new URL("../", import.meta.url))
function cli(args: string[], body: string): ReturnType<typeof spawnSync> {
  // End Node's option parsing explicitly: Node 24 can otherwise consume an
  // --env-file argument intended for the CLI before our rejection code runs.
  return spawnSync(process.execPath, ["--import", "tsx", "--", "scripts/e2e/trial-access-plan.ts", ...args], {
    cwd: root,
    // Do not inherit NODE_OPTIONS, dotenv/loader flags or real provider credentials.
    env: {
      PATH: process.env.PATH,
      SUPABASE_PROJECT_REF: input.projectRef,
      SUPABASE_DB_PASSWORD: "ambient-dummy-must-not-leak",
      ADMIN_REQUIRE_DEVICE_KEY: "false",
      STRIPE_SECRET_KEY: "sk_live_dummy_must_not_leak",
      RESEND_API_KEY: "ambient-dummy-must-not-leak",
    },
    input: body, encoding: "utf8", timeout: 10_000,
  })
}

test("CLI accepts only explicit non-secret stdin and cannot turn a plan into a launch", () => {
  const result = cli(["--dry-run"], JSON.stringify(input))
  assert.equal(result.status, 0, String(result.stderr))
  assert.deepEqual(JSON.parse(String(result.stdout)), createTrialE2EPlan(input))
  assert.doesNotMatch(String(result.stdout) + String(result.stderr), /ambient-dummy|sk_live|ADMIN_REQUIRE_DEVICE_KEY/)
  for (const args of [[], ["--launch"], ["--provision"], ["--dry-run", "--launch"], ["--env-file=.env.local"]]) {
    const denied = cli(args, JSON.stringify(input))
    assert.equal(denied.status, 2, `args=${JSON.stringify(args)} stderr=${String(denied.stderr)}`)
    assert.equal(denied.stdout, "")
    assert.match(String(denied.stderr), /^dry_run_only:/)
  }
})

test("CLI does not use ambient ref or credentials when stdin is absent/incomplete", () => {
  for (const body of ["", "{}", JSON.stringify({ ...input, projectRef: undefined })]) {
    const result = cli(["--dry-run"], body)
    assert.equal(result.status, 2)
    assert.equal(result.stdout, "")
    assert.equal(result.stderr, "invalid_manifest\n")
  }
})

test("CLI redacts malformed, oversized and credential-bearing input", () => {
  for (const body of ["{secret-do-not-print", " ".repeat(16_385), JSON.stringify({ ...input, SUPABASE_SECRET_KEY: "secret-do-not-print" })]) {
    const result = cli(["--dry-run"], body)
    assert.equal(result.status, 2)
    assert.equal(result.stdout, "")
    assert.equal(result.stderr, "invalid_manifest\n")
  }
})