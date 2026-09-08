import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-1" }
const mockFeatures: Record<string, boolean> = {
  commitguard_core: true,
  commitguard_detection: true,
}

let capturedCreateArgs: unknown = null
let capturedUpdateArgs: unknown = null
let capturedTransitionArgs: unknown = null
let capturedReviewArgs: unknown = null
let capturedListCommitmentsUserId: string | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let listRouteGET: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let listRoutePOST: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let itemRouteGET: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let itemRoutePATCH: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let actionsRoutePOST: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let reviewRoutePOST: any

const baseCommitment = {
  id: "commitment-1",
  userId: "user-1",
  name: "Cloud plan",
  description: null,
  category: "software",
  amountCents: 120_000,
  currency: "aud",
  frequency: "monthly",
  nextDueDate: new Date("2026-10-01T00:00:00.000Z"),
  startDate: null,
  endDate: null,
  recurrenceRule: null,
  supplierName: "Acme Cloud",
  supplierId: null,
  accountId: null,
  source: "manual",
  status: "active",
  confidence: "confirmed",
  noticePeriodDays: null,
  renewalDate: null,
  autoRenew: false,
  cancellable: true,
  essentiality: "operational",
  notes: null,
  linkedSpendInsightId: null,
  linkedCostGuardAlertId: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
}

describe("CommitGuard API routes", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: {
            getUser: async () => ({ data: { user: mockUser } }),
          },
        }),
      },
    })

    await mock.module("@/lib/billing", {
      namedExports: {
        requireFeature: async (_userId: string, feature: string) => mockFeatures[feature] ?? false,
      },
    })

    await mock.module("@/lib/commitguard/service", {
      namedExports: {
        listCommitments: async (userId: string) => {
          capturedListCommitmentsUserId = userId
          return [baseCommitment]
        },
        createCommitment: async (userId: string, input: unknown) => {
          capturedCreateArgs = { userId, input }
          return { ...baseCommitment, ...(input as object) }
        },
        updateCommitment: async (userId: string, commitmentId: string, input: unknown) => {
          capturedUpdateArgs = { userId, commitmentId, input }
          return { ...baseCommitment, id: commitmentId, ...(input as object) }
        },
        transitionCommitment: async (
          userId: string,
          commitmentId: string,
          action: string,
          actorId: string,
        ) => {
          capturedTransitionArgs = { userId, commitmentId, action, actorId }
          return { ...baseCommitment, id: commitmentId, status: action === "cancel" ? "cancelled" : "active" }
        },
      },
    })

    await mock.module("@/lib/commitguard/detection", {
      namedExports: {
        reviewDetectedCommitmentCandidate: async (input: unknown) => {
          capturedReviewArgs = input
          return { status: "ok", candidateId: "candidate-1" }
        },
      },
    })

    ;({ GET: listRouteGET, POST: listRoutePOST } = await import("@/app/api/commitguard/commitments/route"))
    ;({ GET: itemRouteGET, PATCH: itemRoutePATCH } = await import("@/app/api/commitguard/commitments/[id]/route"))
    ;({ POST: actionsRoutePOST } = await import("@/app/api/commitguard/commitments/[id]/actions/route"))
    ;({ POST: reviewRoutePOST } = await import("@/app/api/commitguard/detections/[id]/review/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-1" }
    mockFeatures.commitguard_core = true
    mockFeatures.commitguard_detection = true
    capturedCreateArgs = null
    capturedUpdateArgs = null
    capturedTransitionArgs = null
    capturedReviewArgs = null
    capturedListCommitmentsUserId = null
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null

    const res = await listRouteGET(new Request("http://localhost/api/commitguard/commitments"))
    assert.equal(res.status, 401)
  })

  test("returns 403 when core feature is unavailable", async () => {
    mockFeatures.commitguard_core = false

    const res = await listRouteGET(new Request("http://localhost/api/commitguard/commitments"))
    assert.equal(res.status, 403)
  })

  test("creates commitments with server-derived user context", async () => {
    const req = new Request("http://localhost/api/commitguard/commitments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cloud plan",
        category: "software",
        amountCents: 120000,
        currency: "aud",
        frequency: "monthly",
      }),
    })

    const res = await listRoutePOST(req)
    assert.equal(res.status, 201)

    const args = capturedCreateArgs as { userId: string; input: { name: string } } | null
    assert.equal(args?.userId, "user-1")
    assert.equal(args?.input.name, "Cloud plan")
  })

  test("loads commitment by id through user-scoped listing", async () => {
    const res = await itemRouteGET(new Request("http://localhost/api/commitguard/commitments/commitment-1"), {
      params: Promise.resolve({ id: "commitment-1" }),
    })

    assert.equal(res.status, 200)
    assert.equal(capturedListCommitmentsUserId, "user-1")

    const body = (await res.json()) as { commitment: { id: string } }
    assert.equal(body.commitment.id, "commitment-1")
  })

  test("updates commitments with id and tenant context", async () => {
    const req = new Request("http://localhost/api/commitguard/commitments/commitment-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amountCents: 140000,
      }),
    })

    const res = await itemRoutePATCH(req, {
      params: Promise.resolve({ id: "commitment-1" }),
    })

    assert.equal(res.status, 200)

    const args = capturedUpdateArgs as {
      userId: string
      commitmentId: string
      input: { amountCents: number }
    } | null
    assert.equal(args?.userId, "user-1")
    assert.equal(args?.commitmentId, "commitment-1")
    assert.equal(args?.input.amountCents, 140000)
  })

  test("handles pause, confirm, and cancel lifecycle actions", async () => {
    for (const action of ["pause", "confirm", "cancel"] as const) {
      const req = new Request("http://localhost/api/commitguard/commitments/commitment-1/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })

      const res = await actionsRoutePOST(req, {
        params: Promise.resolve({ id: "commitment-1" }),
      })

      assert.equal(res.status, 200)
      const args = capturedTransitionArgs as {
        userId: string
        commitmentId: string
        action: string
        actorId: string
      } | null
      assert.equal(args?.userId, "user-1")
      assert.equal(args?.commitmentId, "commitment-1")
      assert.equal(args?.action, action)
      assert.equal(args?.actorId, "user-1")
    }
  })

  test("requires both core and detection features for candidate review", async () => {
    mockFeatures.commitguard_detection = false

    const req = new Request("http://localhost/api/commitguard/detections/candidate-1/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "confirm" }),
    })

    const res = await reviewRoutePOST(req, {
      params: Promise.resolve({ id: "candidate-1" }),
    })

    assert.equal(res.status, 403)
  })

  test("reviews detected candidate using authenticated user as actor", async () => {
    const req = new Request("http://localhost/api/commitguard/detections/candidate-1/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "edit",
        patch: {
          name: "Adjusted cloud plan",
          category: "software",
          frequency: "monthly",
          typicalAmountCents: 110000,
          confidence: "high",
          source: "spendleak",
        },
      }),
    })

    const res = await reviewRoutePOST(req, {
      params: Promise.resolve({ id: "candidate-1" }),
    })

    assert.equal(res.status, 200)

    const args = capturedReviewArgs as {
      userId: string
      candidateId: string
      action: string
      actorId: string
      patch: { name: string }
    } | null

    assert.equal(args?.userId, "user-1")
    assert.equal(args?.candidateId, "candidate-1")
    assert.equal(args?.action, "edit")
    assert.equal(args?.actorId, "user-1")
    assert.equal(args?.patch.name, "Adjusted cloud plan")
  })
})
