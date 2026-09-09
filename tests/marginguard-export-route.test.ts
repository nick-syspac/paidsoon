import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let mockUser: { id: string } | null = { id: "user-123" }
let mockHasCsvExport = true
let mockHasMarginGuardCore = true
let mockRowCount = 2

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let GET: any

describe("GET /api/margin-guard/export", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/billing", {
      namedExports: {
        requireFeature: async () => mockHasCsvExport,
      },
    })

    await mock.module("@/lib/marginguard/entitlements", {
      namedExports: {
        requireMarginGuardCoreAccess: async () => {
          if (!mockHasMarginGuardCore) throw new Error("Upgrade required")
        },
      },
    })

    await mock.module("@/lib/marginguard/export", {
      namedExports: {
        MarginGuardExportRowLimitExceededError: class MarginGuardExportRowLimitExceededError extends Error {
          rowCount: number
          limit: number

          constructor(rowCount: number, limit: number) {
            super(`Export matched ${rowCount} rows, which exceeds the ${limit}-row export limit.`)
            this.name = "MarginGuardExportRowLimitExceededError"
            this.rowCount = rowCount
            this.limit = limit
          }
        },
        loadMarginGuardExport: async () => ({
          header: ["col_a", "col_b"],
          rows: Array.from({ length: mockRowCount }, () => ["a", "b"]),
        }),
        generateMarginGuardExportCsv: () => "col_a,col_b\r\na,b\r\n",
        generateMarginGuardExportXlsx: () => Buffer.from("xlsx"),
        buildMarginGuardExportFilename: (dataset: string, format: string) => `paidsoon-marginguard-${dataset}.${format}`,
      },
    })

    ;({ GET } = await import("@/app/api/margin-guard/export/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
    mockHasCsvExport = true
    mockHasMarginGuardCore = true
    mockRowCount = 2
  })

  function request(query: string): Request {
    return new Request(`http://localhost/api/margin-guard/export?${query}`)
  }

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const response = await GET(request("format=csv&dataset=summary"))
    assert.equal(response.status, 401)
  })

  test("returns 400 for invalid format or dataset", async () => {
    const response = await GET(request("format=pdf&dataset=unknown"))
    assert.equal(response.status, 400)
  })

  test("returns 403 when csv_export is unavailable", async () => {
    mockHasCsvExport = false
    const response = await GET(request("format=csv&dataset=summary"))
    assert.equal(response.status, 403)
  })

  test("returns 403 when MarginGuard core access is unavailable", async () => {
    mockHasMarginGuardCore = false
    const response = await GET(request("format=csv&dataset=summary"))
    assert.equal(response.status, 403)
  })

  test("returns csv export payload and row count header", async () => {
    mockRowCount = 1
    const response = await GET(request("format=csv&dataset=customers&period=3m"))

    assert.equal(response.status, 200)
    assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8")
    assert.equal(response.headers.get("X-PaidSoon-MarginGuard-Export-Row-Count"), "1")
    const body = await response.text()
    assert.match(body, /col_a,col_b/)
  })

  test("returns xlsx export payload", async () => {
    const response = await GET(request("format=xlsx&dataset=alerts"))

    assert.equal(response.status, 200)
    assert.equal(
      response.headers.get("Content-Type"),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    assert.equal(response.headers.get("X-PaidSoon-MarginGuard-Export-Row-Count"), "2")
  })
})
