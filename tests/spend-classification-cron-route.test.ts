import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { before, test, mock } from "node:test"

let route: typeof import("@/app/api/cron/spend-classification/route")
let workerCalls: number

before(async () => {
  workerCalls = 0
  await mock.module("@/lib/spendClassification/worker", {
    namedExports: {
      runSpendClassificationBatch: async () => {
        workerCalls += 1
        return {
          leaseAcquired: true,
          claimed: 4,
          completed: 2,
          needsReview: 1,
          retryScheduled: 1,
          stale: 0,
          failed: 1,
          skipped: 0,
        }
      },
    },
  })
  route = await import("@/app/api/cron/spend-classification/route")
})

test("returns 401 and skips processing when CRON_SECRET is missing or incorrect", async () => {
  const previousSecret = process.env.CRON_SECRET
  delete process.env.CRON_SECRET
  try {
    const missingSecret = await route.GET(new Request("https://paidsoon.test/api/cron/spend-classification", {
      headers: { authorization: "Bearer undefined" },
    }))
    assert.equal(missingSecret.status, 401)

    process.env.CRON_SECRET = "test-cron-secret"
    const invalidToken = await route.GET(new Request("https://paidsoon.test/api/cron/spend-classification", {
      headers: { authorization: "Bearer wrong" },
    }))
    assert.equal(invalidToken.status, 401)
    assert.equal(workerCalls, 0)
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousSecret
  }
})

test("returns aggregate operational counters without exposing assignment or transaction details", async () => {
  const previousSecret = process.env.CRON_SECRET
  process.env.CRON_SECRET = "test-cron-secret"
  try {
    const response = await route.GET(new Request("https://paidsoon.test/api/cron/spend-classification", {
      headers: { authorization: "Bearer test-cron-secret" },
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      ok: true,
      leaseAcquired: true,
      claimed: 4,
      completed: 2,
      needsReview: 1,
      retryScheduled: 1,
      stale: 0,
      failed: 1,
      skipped: 0,
    })
    assert.equal(workerCalls, 1)
  } finally {
    if (previousSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = previousSecret
  }
})

test("Vercel config schedules the protected classification worker", () => {
  const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    crons: Array<{ path: string; schedule: string }>
  }
  assert.ok(config.crons.some(({ path, schedule }) =>
    path === "/api/cron/spend-classification" && schedule === "0 6 * * *",
  ))
})
