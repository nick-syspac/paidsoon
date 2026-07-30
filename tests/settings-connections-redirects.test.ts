import { before, describe, test, mock } from "node:test"
import assert from "node:assert/strict"

let redirectedTo: string | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stripeSettingsPage: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let integrationsSettingsPage: any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let legacyXeroSelectOrgPage: any

function expectRedirect(value: unknown, expectedUrl: string): void {
  assert.equal(value instanceof Error, true)
  if (value instanceof Error) {
    assert.equal(value.message, "NEXT_REDIRECT")
  }
  assert.equal(redirectedTo, expectedUrl)
}

describe("settings route compatibility redirects", () => {
  before(async () => {
    await mock.module("next/navigation", {
      namedExports: {
        redirect: (url: string) => {
          redirectedTo = url
          throw new Error("NEXT_REDIRECT")
        },
      },
    })

    ;({ default: stripeSettingsPage } = await import("@/app/dashboard/settings/stripe/page"))
    ;({ default: integrationsSettingsPage } = await import("@/app/dashboard/settings/integrations/page"))
    ;({ default: legacyXeroSelectOrgPage } = await import("@/app/dashboard/settings/integrations/xero/select-org/page"))
  })

  test("legacy stripe settings route redirects to canonical connections route", async () => {
    redirectedTo = null
    const result = await stripeSettingsPage({
      searchParams: Promise.resolve({ error: "connection_limit_reached" }),
    }).catch((err: unknown) => err)

    expectRedirect(result, "/dashboard/settings/connections?error=connection_limit_reached")
  })

  test("legacy integrations settings route preserves namespaced source/code params", async () => {
    redirectedTo = null
    const result = await integrationsSettingsPage({
      searchParams: Promise.resolve({ source: "xero", code: "connected" }),
    }).catch((err: unknown) => err)

    expectRedirect(result, "/dashboard/settings/connections?source=xero&code=connected")
  })

  test("legacy integrations xero select-org route redirects to canonical path", async () => {
    redirectedTo = null
    const result = await legacyXeroSelectOrgPage({
      searchParams: Promise.resolve({ key: "abc123" }),
    }).catch((err: unknown) => err)

    expectRedirect(result, "/dashboard/settings/connections/xero/select-org?key=abc123")
  })
})
