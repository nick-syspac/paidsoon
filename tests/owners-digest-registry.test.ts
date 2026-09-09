import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { runOwnersDigestProviderRegistry } from "@/lib/ownersDigest/providers"

describe("Owner's Digest provider registry", () => {
  test("converts provider failures into unavailable results", async () => {
    const results = await runOwnersDigestProviderRegistry([
      {
        source: "paidsoon",
        load: async () => ({
          source: "paidsoon",
          status: "complete",
          signals: [],
          metrics: [],
          dataAsOf: null,
          stale: false,
          entitled: true,
          configured: true,
          available: true,
        }),
      },
      {
        source: "taxbuffer",
        load: async () => {
          throw new Error("provider down")
        },
      },
    ])

    assert.equal(results.length, 2)
    assert.equal(results[1].source, "taxbuffer")
    assert.equal(results[1].status, "unavailable")
    assert.equal(results[1].errorCode, "provider_failed")
  })
})
