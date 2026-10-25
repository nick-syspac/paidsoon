import assert from "node:assert/strict"
import { before, beforeEach, describe, mock, test } from "node:test"

let redirectedTo: string | null = null
let currentUser: { id: string } | null = { id: "tenant-a" }
let currentTier: string | null = "small_business"
let loadSettingsCalls = 0

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let spendLeakSettingsPage: any

describe("spendleak settings page access", () => {
  before(async () => {
    await mock.module("next/navigation", {
      namedExports: {
        redirect: (url: string) => {
          redirectedTo = url
          throw new Error("NEXT_REDIRECT")
        },
      },
    })

    await mock.module("@/lib/supabase/server", {
      namedExports: {
        getAuthenticatedUser: async () => ({ data: { user: currentUser } }),
      },
    })

    await mock.module("@/lib/billing", {
      namedExports: {
        getSubscriptionTier: async () => currentTier,
      },
    })

    await mock.module("@/lib/spendleak/sourceSettings", {
      namedExports: {
        getSpendLeakSourceSettings: async () => {
          loadSettingsCalls += 1
          return {
            enabledSourceTypes: ["bills", "bank_transactions", "suppliers"],
            isDefault: false,
          }
        },
      },
    })

    ;({ default: spendLeakSettingsPage } = await import("@/app/settings/spendleak/page"))
  })

  beforeEach(() => {
    redirectedTo = null
    currentUser = { id: "tenant-a" }
    currentTier = "small_business"
    loadSettingsCalls = 0
  })

  test("redirects unauthenticated users to sign-in", async () => {
    currentUser = null
    const result = await spendLeakSettingsPage().catch((error: unknown) => error)

    assert.equal(result instanceof Error, true)
    assert.equal((result as Error).message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/sign-in")
    assert.equal(loadSettingsCalls, 0)
  })

  test("redirects non-entitled users to subscription intent", async () => {
    currentTier = "essentials"
    const result = await spendLeakSettingsPage().catch((error: unknown) => error)

    assert.equal(result instanceof Error, true)
    assert.equal((result as Error).message, "NEXT_REDIRECT")
    assert.equal(redirectedTo, "/settings/subscription?intent=spendleak")
    assert.equal(loadSettingsCalls, 0)
  })

  test("loads settings payload only for entitled users", async () => {
    const result = await spendLeakSettingsPage()

    assert.equal(loadSettingsCalls, 1)
    assert.equal(result?.type, "div")
    assert.equal(redirectedTo, null)
  })
})
