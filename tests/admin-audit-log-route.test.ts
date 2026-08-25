import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"
import { NextRequest } from "next/server"

const guardContext = {
  userId: "admin-1",
  userEmail: "admin@paidsoon.com",
  platformRole: { role: "platform_support" },
  adminSession: { id: "session-admin" },
}

type AuditRow = {
  id: string
  adminSessionId: string | null
  actorUserId: string
  actorEmail: string
  action: string
  targetType: string | null
  targetId: string | null
  targetUserId: string | null
  resourceId: string | null
  reason: string | null
  details: Record<string, unknown> | null
  success: boolean
  createdAt: Date
}

const rows: AuditRow[] = [
  {
    id: "evt-1",
    adminSessionId: "sess-1",
    actorUserId: "admin-1",
    actorEmail: "admin@paidsoon.com",
    action: "customer_search",
    targetType: "user_profile",
    targetId: "user-1",
    targetUserId: "user-1",
    resourceId: null,
    reason: null,
    details: { query: "alice" },
    success: true,
    createdAt: new Date("2026-08-21T00:00:00.000Z"),
  },
  {
    id: "evt-2",
    adminSessionId: "sess-2",
    actorUserId: "admin-1",
    actorEmail: "admin@paidsoon.com",
    action: "pause_invoices",
    targetType: "tracked_invoice",
    targetId: "inv-2",
    targetUserId: "user-2",
    resourceId: "inv-2",
    reason: "Customer requested hold",
    details: null,
    success: true,
    createdAt: new Date("2026-08-22T00:00:00.000Z"),
  },
  {
    id: "evt-3",
    adminSessionId: null,
    actorUserId: "admin-1",
    actorEmail: "admin@paidsoon.com",
    action: "resume_invoices",
    targetType: "tracked_invoice",
    targetId: "inv-3",
    targetUserId: "user-1",
    resourceId: "inv-3",
    reason: "Issue resolved by customer",
    details: null,
    success: true,
    createdAt: new Date("2026-08-23T00:00:00.000Z"),
  },
]

let capturedWhere: Record<string, unknown> | undefined
let capturedSort: "asc" | "desc" | undefined
let GET: (request: NextRequest) => Promise<Response>

function applyWhere(source: AuditRow[], where: Record<string, unknown>): AuditRow[] {
  return source.filter((row) => {
    if (typeof where.targetUserId === "string" && row.targetUserId !== where.targetUserId) return false
    if (typeof where.action === "string" && row.action !== where.action) return false
    if (typeof where.adminSessionId === "string" && row.adminSessionId !== where.adminSessionId) return false

    if (typeof where.createdAt === "object" && where.createdAt !== null) {
      const createdAt = where.createdAt as { gte?: Date; lte?: Date }
      if (createdAt.gte && row.createdAt < createdAt.gte) return false
      if (createdAt.lte && row.createdAt > createdAt.lte) return false
    }

    return true
  })
}

describe("admin audit log route", () => {
  before(async () => {
    await mock.module("@/lib/admin/guard", {
      namedExports: {
        requireAdminElevation: async () => guardContext,
        AdminGuardError: class extends Error {
          code = "unauthenticated"
        },
      },
    })

    await mock.module("@/lib/db/admin", {
      namedExports: {
        prismaAdmin: {
          adminAuditEvent: {
            findMany: async (args: {
              where?: Record<string, unknown>
              orderBy?: { createdAt: "asc" | "desc" }
              take: number
            }) => {
              capturedWhere = args.where ?? {}
              capturedSort = args.orderBy?.createdAt
              const filtered = applyWhere(rows, capturedWhere)
              const sorted = [...filtered].sort((a, b) => {
                return capturedSort === "asc"
                  ? a.createdAt.getTime() - b.createdAt.getTime()
                  : b.createdAt.getTime() - a.createdAt.getTime()
              })
              return sorted.slice(0, args.take)
            },
          },
          adminSession: {
            findMany: async () => [
              {
                id: "sess-1",
                userId: "admin-1",
                impersonatedUserId: "user-1",
                startedAt: new Date("2026-08-21T00:00:00.000Z"),
                endedAt: new Date("2026-08-21T00:20:00.000Z"),
                duration: 1200,
                actionCount: 3,
              },
            ],
          },
        },
      },
    })

    ;({ GET } = await import("@/app/api/admin/audit-log/route"))
  })

  beforeEach(() => {
    capturedWhere = undefined
    capturedSort = undefined
  })

  test("filters by targetUserId and sorts descending by default", async () => {
    const request = new NextRequest("http://localhost/api/admin/audit-log?targetUserId=user-1")
    const response = await GET(request)

    assert.equal(response.status, 200)
    assert.equal(capturedWhere?.targetUserId, "user-1")
    assert.equal(capturedSort, "desc")

    const body = (await response.json()) as { items: AuditRow[] }
    assert.ok(body.items.every((item) => item.targetUserId === "user-1"))
  })

  test("filters by sessionId and respects explicit ascending sort", async () => {
    const request = new NextRequest("http://localhost/api/admin/audit-log?sessionId=sess-1&sort=asc")
    const response = await GET(request)

    assert.equal(response.status, 200)
    assert.equal(capturedWhere?.adminSessionId, "sess-1")
    assert.equal(capturedSort, "asc")

    const body = (await response.json()) as { items: AuditRow[] }
    assert.ok(body.items.every((item) => item.adminSessionId === "sess-1"))
  })
})
