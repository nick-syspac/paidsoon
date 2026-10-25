import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"
import type {
  BillingRiskSnapshot,
  EffectiveAccessProfile,
  TrialGrantSnapshot,
} from "@/lib/billing/effectiveAccess"

const now = new Date("2026-10-17T12:00:00Z")
const expiry = new Date("2026-10-18T12:00:00Z")
type Params = { params: Promise<{ id: string }> }
type InvoiceRoute = (request: Request, params: Params) => Promise<Response>
type Query = { where: { userId: string }; select: Record<string, boolean> }

describe("central subscription boundary with real resolver and mocked RLS only", () => {
  let user: { id: string } | null
  let authError: Error | null
  let profiles: Map<string, EffectiveAccessProfile>
  let grants: Map<string, TrialGrantSnapshot>
  let risks: Map<string, BillingRiskSnapshot[]>
  let snapshotReads: Array<{ tenant: string; model: string; query: Query }>
  let businessReads: number
  let writes: number
  let unavailable: boolean
  let invoiceOwner: string
  let invoiceStatus: string
  let depositCalls: string[]
  let routes: Record<string, InvoiceRoute>
  let disconnect: typeof import("@/app/api/stripe/connect/disconnect/route").POST
  let deleteMapping: typeof import("@/app/api/invoice-imports/mapping-profiles/[profileId]/route").DELETE
  let depositActions: typeof import("@/app/api/deposit-guard/requests/[requestId]/route").POST
  let archiveJob: typeof import("@/app/api/deposit-guard/jobs/[jobId]/route").DELETE
  let deleteMilestone: typeof import("@/app/api/deposit-guard/milestones/[milestoneId]/route").DELETE
  let resetTemplate: typeof import("@/app/api/settings/templates/route").DELETE
  let requireAccess: typeof import("@/lib/billing/accessGuard").requireSubscriptionAccess
  let wrap: typeof import("@/lib/billing/subscriptionRoute").withSubscriptionAccess

  function grant(plan = "small_business"): TrialGrantSnapshot {
    return { plan, startsAt: now, expiresAt: expiry, revokedAt: null }
  }

  function request(action: string, body: unknown = {}): Request {
    return new Request(`https://app.example/api/invoices/invoice-a/${action}`, {
      method: "POST", body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  }

  function invoke(action: string, id = "invoice-a"): Promise<Response> {
    return routes[action](request(action, action === "payments" ? { amount: 100, currency: "aud" } : {}), {
      params: Promise.resolve({ id }),
    })
  }

  before(async () => {
    // No real database/admin client, authentication network, payments or providers.
    // The production loader, snapshot reader, resolver and route wrapper are NOT mocked.
    await mock.module("@/lib/supabase/server", {
      namedExports: { createClient: async () => ({
        auth: { getUser: async () => ({ data: { user }, error: authError }) },
      }) },
    })
    await mock.module("@/lib/db/withUserContext", {
      namedExports: { withUserContext: async <T>(tenant: string, fn: (tx: unknown) => Promise<T>) => {
        assert.equal(tenant, user?.id, "RLS context must use the authenticated identity")
        function read(model: string, query: Query): void {
          assert.deepEqual(query.where, { userId: tenant })
          snapshotReads.push({ tenant, model, query })
          if (unavailable) throw new Error("private database connection details")
        }
        return fn({
          userProfile: { findUnique: async (query: Query) => {
            read("profile", query)
            return profiles.get(tenant) ?? null
          } },
          tenantTrialGrant: { findUnique: async (query: Query) => {
            read("grant", query)
            return grants.get(tenant) ?? null
          } },
          tenantBillingRisk: { findMany: async (query: Query) => {
            read("risk", query)
            return risks.get(tenant) ?? []
          } },
          trackedInvoice: {
            findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
              businessReads++
              assert.equal(where.userId, tenant)
              if (where.id !== "invoice-a" || invoiceOwner !== tenant) return null
              return { id: "invoice-a", userId: tenant, status: invoiceStatus,
                financialInvoice: { amountDueCents: 500, currency: "aud" } }
            },
            update: async () => { writes++; return {} },
            updateMany: async () => { writes++; return { count: 1 } },
          },
          invoicePayment: { findMany: async () => [] },
          invoiceConnection: {
            findFirst: async ({ where }: { where: { userId: string } }) => {
              businessReads++
              assert.equal(where.userId, tenant)
              return { id: "connection-a" }
            },
            update: async () => { writes++; return {} },
          },
          invoiceImportMappingProfile: {
            findFirst: async ({ where }: { where: { userId: string } }) => {
              businessReads++
              assert.equal(where.userId, tenant)
              return { id: "mapping-a" }
            },
            delete: async () => { writes++; return {} },
          },
          emailTemplate: {
            findUnique: async () => ({ id: "template-a" }),
            delete: async () => { writes++; return {} },
          },
        })
      } },
    })
    await mock.module("@/lib/invoices/payments", {
      namedExports: {
        computeOutstanding: () => 500,
        recordInvoicePayment: async () => { writes++; return { outstanding: 0, markedPaid: true } },
      },
    })
    async function depositCall(action: string, tenant: string): Promise<{ id: string }> {
      assert.equal(tenant, user?.id)
      depositCalls.push(action)
      return { id: "deposit-a" }
    }
    await mock.module("@/lib/depositGuard/requests", {
      namedExports: {
        cancelDepositRequest: (tenant: string) => depositCall("cancel", tenant),
        sendDepositRequest: (tenant: string) => depositCall("send", tenant),
        resendDepositRequest: (tenant: string) => depositCall("resend", tenant),
        updateDepositRequestDueDate: (tenant: string) => depositCall("due-date", tenant),
        toRequestAccessError: () => null,
      },
    })
    await mock.module("@/lib/depositGuard/jobs", {
      namedExports: {
        DepositGuardAccessError: class extends Error {},
        archiveDepositGuardJob: (tenant: string) => depositCall("archive", tenant),
        updateDepositGuardJob: (tenant: string) => depositCall("update-job", tenant),
      },
    })
    await mock.module("@/lib/depositGuard/milestones", {
      namedExports: {
        deleteDepositGuardMilestone: (tenant: string) => depositCall("delete-milestone", tenant),
        updateDepositGuardMilestone: (tenant: string) => depositCall("update-milestone", tenant),
      },
    })
    routes = {
      pause: (await import("@/app/api/invoices/[id]/pause/route")).POST,
      resume: (await import("@/app/api/invoices/[id]/resume/route")).POST,
      snooze: (await import("@/app/api/invoices/[id]/snooze/route")).POST,
      "cancel-snooze": (await import("@/app/api/invoices/[id]/cancel-snooze/route")).POST,
      resolve: (await import("@/app/api/invoices/[id]/resolve/route")).POST,
      dispute: (await import("@/app/api/invoices/[id]/dispute/route")).POST,
      "resolve-dispute": (await import("@/app/api/invoices/[id]/resolve-dispute/route")).POST,
      payments: (await import("@/app/api/invoices/[id]/payments/route")).POST,
      "mark-paid": (await import("@/app/api/invoices/[id]/mark-paid/route")).POST,
    }
    ;({ POST: disconnect } = await import("@/app/api/stripe/connect/disconnect/route"))
    ;({ DELETE: deleteMapping } = await import("@/app/api/invoice-imports/mapping-profiles/[profileId]/route"))
    ;({ POST: depositActions } = await import("@/app/api/deposit-guard/requests/[requestId]/route"))
    ;({ DELETE: archiveJob } = await import("@/app/api/deposit-guard/jobs/[jobId]/route"))
    ;({ DELETE: deleteMilestone } = await import("@/app/api/deposit-guard/milestones/[milestoneId]/route"))
    ;({ DELETE: resetTemplate } = await import("@/app/api/settings/templates/route"))
    ;({ requireSubscriptionAccess: requireAccess } = await import("@/lib/billing/accessGuard"))
    ;({ withSubscriptionAccess: wrap } = await import("@/lib/billing/subscriptionRoute"))
  })

  beforeEach((context) => {
    assert.ok("mock" in context, "this hook runs for a test, not a nested suite")
    context.mock.timers.enable({ apis: ["Date"], now })
    user = { id: "tenant-a" }; authError = null
    const profile: EffectiveAccessProfile = {
      subscriptionStatus: "canceled", subscriptionTier: "essentials",
      stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 7,
    }
    profiles = new Map([["tenant-a", profile], ["tenant-b", profile]])
    grants = new Map([["tenant-a", grant()], ["tenant-b", grant("business_pro")]])
    risks = new Map(); snapshotReads = []; businessReads = 0; writes = 0; depositCalls = []
    unavailable = false; invoiceOwner = "tenant-a"; invoiceStatus = "pending"
  })

  test("all four public grant plans authorize featureless invoice operations without billing-tier fallback", async () => {
    for (const tier of ["essentials", "business_control", "small_business", "business_pro"]) {
      grants.set("tenant-a", grant(tier))
      assert.equal((await requireAccess("tenant-a")).effectiveTier, tier)
      for (const action of Object.keys(routes)) {
        invoiceStatus = action === "resume" ? "paused" : action === "cancel-snooze" ? "snoozed"
          : action === "resolve-dispute" ? "disputed" : "pending"
        const response = await invoke(action)
        assert.equal(response.status, 200, `${tier}: ${action}`)
        assert.equal((await response.json()).success, true)
      }
    }
    assert.equal(writes, 36)
    assert.ok(snapshotReads.every((read) => read.tenant === "tenant-a"))
  })

  test("exclusive expiry and revocation block all nine invoice mutations before business reads or side effects", async (context) => {
    for (const state of ["expired", "revoked"] as const) {
      context.mock.timers.setTime(state === "expired" ? expiry.getTime() : now.getTime())
      grants.set("tenant-a", state === "revoked" ? { ...grant(), revokedAt: now } : grant())
      for (const action of Object.keys(routes)) {
        const response = await invoke(action)
        assert.equal(response.status, 403, `${state}: ${action}`)
        assert.deepEqual(await response.json(), {
          error: "Subscription access required", code: "no_access", allowAccess: false,
          effectiveTier: null, billingResolutionUrl: "/settings/subscription",
        })
      }
    }
    assert.equal(businessReads, 0)
    assert.equal(writes, 0)
  })

  test("each authorization reloads facts: a previously allowed request cannot cache access past expiry or revocation", async (context) => {
    assert.equal((await invoke("pause")).status, 200)
    context.mock.timers.setTime(expiry.getTime())
    assert.equal((await invoke("pause")).status, 403)
    context.mock.timers.setTime(now.getTime())
    grants.set("tenant-a", { ...grant(), revokedAt: now })
    assert.equal((await invoke("pause")).status, 403)
    assert.equal(snapshotReads.length, 9)
    assert.equal(writes, 1)
  })

  test("another tenant's valid grant cannot authorize the authenticated tenant", async () => {
    grants.delete("tenant-a")
    assert.equal((await invoke("pause")).status, 403)
    assert.equal(businessReads, 0)
    assert.equal(writes, 0)
    assert.deepEqual(snapshotReads.map((read) => read.query.where), Array(3).fill({ userId: "tenant-a" }))
  })

  test("a valid own grant cannot read or mutate another tenant's invoice on any invoice route", async () => {
    invoiceOwner = "tenant-b"
    for (const action of Object.keys(routes)) {
      assert.equal((await invoke(action)).status, 404, action)
    }
    assert.equal(businessReads, 9)
    assert.equal(writes, 0)
  })

  test("missing profiles, unknown billing and blocking debt fail closed without writes", async () => {
    profiles.delete("tenant-a")
    assert.equal((await invoke("pause")).status, 403)
    profiles.set("tenant-a", { subscriptionStatus: "unknown", subscriptionTier: "business_pro",
      stripeSubscriptionId: null, trialEndsAt: null, billingAccessVersion: 7 })
    assert.equal((await invoke("pause")).status, 403)
    profiles.get("tenant-a")!.subscriptionStatus = "canceled"
    risks.set("tenant-a", [{ kind: "subscription_dispute", stripeStatus: "lost", blocking: true }])
    assert.equal((await invoke("pause")).status, 403)
    assert.equal(businessReads, 0)
    assert.equal(writes, 0)
  })

  test("paid and grace access survive retained grant revocation, using the billing plan", async () => {
    grants.set("tenant-a", { ...grant("business_pro"), revokedAt: now })
    for (const status of ["active", "past_due"]) {
      profiles.set("tenant-a", { subscriptionStatus: status, subscriptionTier: "business_control",
        stripeSubscriptionId: "sub-test", trialEndsAt: null, billingAccessVersion: 8 })
      assert.equal((await requireAccess("tenant-a")).effectiveTier, "business_control")
      assert.equal((await invoke("pause")).status, 200)
    }
  })

  test("unauthenticated and invalid sessions stop before access or resource queries", async () => {
    user = null
    assert.equal((await invoke("pause")).status, 401)
    user = { id: "tenant-a" }; authError = new Error("invalid session")
    assert.equal((await invoke("pause")).status, 401)
    assert.equal(snapshotReads.length, 0)
    assert.equal(businessReads, 0)
    assert.equal(writes, 0)
  })

  test("unavailable access reads return safe 503 without fallback, business work or private details", async () => {
    unavailable = true
    const response = await invoke("pause")
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: "Access verification unavailable" })
    assert.equal(businessReads, 0)
    assert.equal(writes, 0)
  })

  test("wrapper preserves arguments, response and existing feature denial after access authorization", async () => {
    const original = new Response("feature unavailable", { status: 403 })
    const wrapped = wrap(async (request: Request, marker: string) => {
      assert.equal(request.url, "https://app.example/api/invoices/invoice-a/pause")
      assert.equal(marker, "unchanged")
      return original
    })
    assert.equal(await wrapped(request("pause"), "unchanged"), original)
  })

  test("expired and revoked tenants can still disconnect sources and delete saved mapping profiles without access reads", async () => {
    for (const state of ["expired", "revoked"] as const) {
      grants.set("tenant-a", state === "expired" ? { ...grant(), expiresAt: now }
        : { ...grant(), revokedAt: now })
      assert.equal((await disconnect(request("disconnect"))).status, 200)
      assert.equal((await deleteMapping(request("delete"), {
        params: Promise.resolve({ profileId: "mapping-a" }),
      })).status, 200)
    }
    assert.equal(snapshotReads.length, 0)
    assert.equal(writes, 6)
    user = null
    assert.equal((await disconnect(request("disconnect"))).status, 401)
  })

  test("mixed deposit action endpoint blocks send/resend but permits cancellation after expiry or revocation", async () => {
    for (const state of ["expired", "revoked"] as const) {
      grants.set("tenant-a", state === "expired" ? { ...grant(), expiresAt: now }
        : { ...grant(), revokedAt: now })
      for (const action of ["send", "resend"]) {
        const response = await depositActions(request(action, { action }), {
          params: Promise.resolve({ requestId: "deposit-a" }),
        })
        assert.equal(response.status, 403)
      }
      assert.deepEqual(depositCalls, state === "expired" ? [] : ["cancel"])
      const readCount = snapshotReads.length
      assert.equal((await depositActions(request("cancel", { action: "cancel" }), {
        params: Promise.resolve({ requestId: "deposit-a" }),
      })).status, 200)
      assert.equal(snapshotReads.length, readCount, "cancellation must not require access")
    }
    assert.deepEqual(depositCalls, ["cancel", "cancel"])
  })

  test("mixed deposit endpoint authorizes valid grants and fails closed on unavailable access before sending", async () => {
    for (const action of ["send", "resend"]) {
      assert.equal((await depositActions(request(action, { action }), {
        params: Promise.resolve({ requestId: "deposit-a" }),
      })).status, 200)
    }
    assert.deepEqual(depositCalls, ["send", "resend"])
    unavailable = true
    assert.equal((await depositActions(request("send", { action: "send" }), {
      params: Promise.resolve({ requestId: "deposit-a" }),
    })).status, 503)
    assert.deepEqual(depositCalls, ["send", "resend"])
  })

  test("archive, milestone deletion and template reset remain authenticated cleanup after expiry or revocation", async () => {
    for (const state of ["expired", "revoked"] as const) {
      grants.set("tenant-a", state === "expired" ? { ...grant(), expiresAt: now }
        : { ...grant(), revokedAt: now })
      assert.equal((await archiveJob(request("archive"), {
        params: Promise.resolve({ jobId: "job-a" }),
      })).status, 200)
      assert.equal((await deleteMilestone(request("delete"), {
        params: Promise.resolve({ milestoneId: "milestone-a" }),
      })).status, 200)
      assert.equal((await resetTemplate(new Request("https://app.example/api/settings/templates?stage=1", {
        method: "DELETE",
      }))).status, 200)
    }
    assert.equal(snapshotReads.length, 0)
    assert.deepEqual(depositCalls, ["archive", "delete-milestone", "archive", "delete-milestone"])
    user = null
    assert.equal((await archiveJob(request("archive"), { params: Promise.resolve({ jobId: "job-a" }) })).status, 401)
  })
})