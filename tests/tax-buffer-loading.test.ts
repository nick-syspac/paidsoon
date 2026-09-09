import assert from "node:assert/strict"
import { describe, test } from "node:test"

describe("Tax Buffer loading state", () => {
  test("renders loading message and spinner container", async () => {
    const moduleNamespace = await import("@/app/dashboard/tax-buffer/loading")
    const candidateExports = [
      moduleNamespace.default,
      (moduleNamespace as unknown as { TaxBufferLoading?: unknown }).TaxBufferLoading,
    ]
    const TaxBufferLoading = candidateExports.find((candidate) => typeof candidate === "function") as
      | (() => { props?: unknown })
      | undefined

    assert.ok(TaxBufferLoading, "Expected loading module to export a component function")
    const element = TaxBufferLoading()
    const serialized = JSON.stringify(element)

    assert.match(serialized, /Loading Tax Buffer/)
    assert.match(serialized, /rounded-xl border border-gray-200 bg-white p-6/)
  })
})
