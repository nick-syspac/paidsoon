import { z } from "zod"

// Planning only: no process.env, dotenv, application imports, SDKs or I/O here.
// These inputs are non-secret review metadata, never runtime credentials.
const projectRef = z.string().regex(/^[a-z]{20}$/)
const reviewToken = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/)
const manifest = z.object({
  projectRef,
  reviewedProjectRef: projectRef,
  sharedProjectRefs: z.object({
    development: projectRef,
    production: projectRef,
  }).strict(),
  disposable: z.literal(true),
  reviewId: reviewToken,
  runId: z.uuid(),
  port: z.number().int().min(1024).max(65535),
}).strict()

export type TrialE2EPlanErrorCode =
  | "invalid_manifest"
  | "unreviewed_target"
  | "shared_target"
  | "placeholder_target"

export class TrialE2EPlanError extends Error {
  constructor(public readonly code: TrialE2EPlanErrorCode) {
    // Never echo input, Zod issues, keys, URLs or credential-like unknown fields.
    super(code)
    this.name = "TrialE2EPlanError"
  }
}

export interface TrialE2EPlan {
  readonly kind: "offline-launch-plan-only"
  readonly launchAllowed: false
  readonly task94Complete: false
  readonly target: {
    readonly projectRef: string
    readonly reviewId: string
    readonly runId: string
  }
  readonly next: {
    readonly hostname: "127.0.0.1"
    readonly port: number
    readonly workspace: "external-disposable-copy-without-dotenv"
    readonly environment: "explicit-allowlist-no-inheritance"
    readonly authorization: "real-auth-role-device-signed-challenge"
    readonly providers: "server-side-stripe-resend-stubs-required"
  }
  readonly blockers: readonly string[]
}

/** Shape/equality checks cannot prove a remote project is isolated or empty.
 * A successful plan MUST NOT be used as permission to launch or provision. */
export function createTrialE2EPlan(input: unknown): TrialE2EPlan {
  const parsed = manifest.safeParse(input)
  if (!parsed.success) throw new TrialE2EPlanError("invalid_manifest")
  const value = parsed.data
  if (value.projectRef !== value.reviewedProjectRef) {
    throw new TrialE2EPlanError("unreviewed_target")
  }
  if (Object.values(value.sharedProjectRefs).includes(value.projectRef)) {
    throw new TrialE2EPlanError("shared_target")
  }
  // The runbook's example/test ref is not a reviewed disposable target.
  if (value.projectRef === "abcdefghijklmnopqrst") {
    throw new TrialE2EPlanError("placeholder_target")
  }
  return Object.freeze({
    kind: "offline-launch-plan-only",
    launchAllowed: false,
    task94Complete: false,
    target: Object.freeze({ projectRef: value.projectRef, reviewId: value.reviewId, runId: value.runId }),
    next: Object.freeze({
      hostname: "127.0.0.1",
      port: value.port,
      workspace: "external-disposable-copy-without-dotenv",
      environment: "explicit-allowlist-no-inheritance",
      authorization: "real-auth-role-device-signed-challenge",
      providers: "server-side-stripe-resend-stubs-required",
    }),
    blockers: Object.freeze([
      "independent-isolated-project-and-shared-ref-review",
      "explicit-secret-interface-and-project-bound-credentials",
      "isolated-schema-constraints-rls-and-empty-fixture-baseline",
      "reviewed-auth-role-device-provisioning-and-real-signed-elevation",
      "next-server-provider-interception-and-egress-proof",
      "opt-in-fixture-provisioning-cleanup-and-browser-scenarios",
    ]),
  })
}