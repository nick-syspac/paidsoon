import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

class MockAdminGuardError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = "AdminGuardError"
    this.code = code
  }
}

type TrainingSnapshot = {
  title: string
  slug: string
  summary: string | null
  content: Record<string, unknown>
  audience: "public" | "signed_in"
  featureKey?: string | null
  routeHint?: string | null
  destinationKeys?: string[] | null
}

type MockRevision = {
  id: string
  trainingContentId: string
  revisionNumber: number
  snapshot: TrainingSnapshot
}

const guardContext = {
  userId: "admin-1",
  userEmail: "admin@paidsoon.com",
  platformRole: { role: "platform_admin" },
  adminSession: { id: "admin-session-1" },
}

let sourceRevision: MockRevision | null = null
let latestRevisionNumber = 0
let createdRevisionArgs: unknown = null
let updatedTrainingContentArgs: unknown = null
let loggedAuditAction: string | null = null

const updatedContentRow = {
  id: "content-1",
  slug: "chase-overdue-invoices",
  title: "Chase overdue invoices",
  summary: "How to chase overdue invoices safely",
  content: { type: "doc", body: [] },
  audience: "public" as const,
  featureKey: null,
  routeHint: null,
  destinationKeys: ["help.overview"],
  lifecycleState: "draft",
  publishedAt: null,
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let restoreRoute: any

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested)
    }
  }
  return value
}

describe("Admin training restore revision behavior", () => {
  before(async () => {
    await mock.module("@/lib/admin/guard", {
      namedExports: {
        requireAdminElevation: async () => guardContext,
        AdminGuardError: MockAdminGuardError,
      },
    })

    await mock.module("@/lib/admin/audit", {
      namedExports: {
        logAdminEvent: async (input: { action: string }) => {
          loggedAuditAction = input.action
        },
      },
    })

    await mock.module("@/lib/admin/request", {
      namedExports: {
        generateRequestId: () => "req-training-restore",
        getIpAddress: () => "127.0.0.1",
        getUserAgent: () => "node-test",
      },
    })

    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          trainingRevision: {
            findUnique: async () => sourceRevision,
          },
          $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
            const tx = {
              trainingRevision: {
                findFirst: async () => ({ revisionNumber: latestRevisionNumber }),
                create: async (args: unknown) => {
                  createdRevisionArgs = args
                  return { id: "rev-new" }
                },
              },
              trainingContent: {
                update: async (args: unknown) => {
                  updatedTrainingContentArgs = args
                  return updatedContentRow
                },
              },
            }

            return fn(tx)
          },
        },
      },
    })

    ;({ POST: restoreRoute } = await import("@/app/api/admin/training/[id]/restore/route"))
  })

  beforeEach(() => {
    createdRevisionArgs = null
    updatedTrainingContentArgs = null
    loggedAuditAction = null
    latestRevisionNumber = 3

    sourceRevision = {
      id: "rev-2",
      trainingContentId: "content-1",
      revisionNumber: 2,
      snapshot: deepFreeze({
        title: "Original guide title",
        slug: "chase-overdue-invoices",
        summary: "Original summary",
        content: { type: "doc", body: [{ type: "paragraph", text: "Original" }] },
        audience: "public",
        featureKey: null,
        routeHint: null,
        destinationKeys: ["help.overview"],
      }),
    }
  })

  test("restore appends a new revision and preserves the source snapshot", async () => {
    const req = new Request("http://localhost/api/admin/training/content-1/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revisionId: "rev-2" }),
    })

    const res = await restoreRoute(req, { params: Promise.resolve({ id: "content-1" }) })
    assert.equal(res.status, 200)

    const body = await res.json()
    assert.equal(body.item.id, "content-1")
    assert.equal(body.item.lifecycleState, "draft")

    const createdData = (createdRevisionArgs as { data: Record<string, unknown> }).data
    assert.equal(createdData.revisionNumber, 4)
    assert.equal(createdData.snapshotState, "draft")
    assert.equal(createdData.restoredFromRevisionId, "rev-2")
    assert.equal(createdData.changeNote, "Restored from revision 2")

    const updatedData = (updatedTrainingContentArgs as { data: Record<string, unknown> }).data
    assert.equal(updatedData.lifecycleState, "draft")
    assert.equal(updatedData.publishedAt, null)

    assert.equal(sourceRevision?.revisionNumber, 2)
    assert.equal(sourceRevision?.snapshot.title, "Original guide title")
    assert.equal(loggedAuditAction, "training_restored")
  })

  test("restore uses latest revision number and honors explicit change note", async () => {
    latestRevisionNumber = 7

    const req = new Request("http://localhost/api/admin/training/content-1/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        revisionId: "rev-2",
        changeNote: "Restore stable baseline after review regression",
      }),
    })

    const res = await restoreRoute(req, { params: Promise.resolve({ id: "content-1" }) })
    assert.equal(res.status, 200)

    const createdData = (createdRevisionArgs as { data: Record<string, unknown> }).data
    assert.equal(createdData.revisionNumber, 8)
    assert.equal(createdData.changeNote, "Restore stable baseline after review regression")
  })
})
