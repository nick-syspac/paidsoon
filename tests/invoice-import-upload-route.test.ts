import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

let mockUser: { id: string } | null = { id: "user-123" }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let POST: any

describe("POST /api/invoice-imports/upload", () => {
  before(async () => {
    await mock.module("@/lib/supabase/server", {
      namedExports: {
        createClient: async () => ({
          auth: { getUser: async () => ({ data: { user: mockUser } }) },
        }),
      },
    })

    await mock.module("@/lib/db/withUserContext", {
      namedExports: {
        withUserContext: async (_userId: string, fn: (tx: unknown) => unknown) => {
          const tx = {
            invoiceImportBatch: {
              create: async () => ({
                id: "batch-1",
                fileType: "csv",
                fileName: "invoice-import.csv",
                rowsTotal: 0,
                status: "uploaded",
                schemaVersion: "test",
              }),
            },
            invoiceImportStagingRow: {
              createMany: async () => ({ count: 0 }),
            },
          }
          return fn(tx)
        },
      },
    })

    ;({ POST } = await import("@/app/api/invoice-imports/upload/route"))
  })

  beforeEach(() => {
    mockUser = { id: "user-123" }
  })

  function makeRequest(file: File) {
    const formData = new FormData()
    formData.set("file", file)
    return new Request("http://localhost/api/invoice-imports/upload", { method: "POST", body: formData })
  }

  test("rejects XLSX uploads during launch", async () => {
    const response = await POST(
      makeRequest(
        new File(["customer_name,customer_email\nAcme,accounts@example.com\n"], "invoice-import.xlsx", {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      ),
    )

    assert.equal(response.status, 400)
    const body = await response.json()
    assert.match(String(body.error), /Only CSV invoice imports are supported for launch/i)
  })

  test("returns 401 when unauthenticated", async () => {
    mockUser = null
    const response = await POST(
      makeRequest(
        new File(["customer_name,customer_email\nAcme,accounts@example.com\n"], "invoice-import.csv", {
          type: "text/csv",
        }),
      ),
    )

    assert.equal(response.status, 401)
  })
})