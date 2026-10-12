import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  getModuleById,
  getModulesByPlatformArea,
  getRelatedModules,
  getJourneyCta,
  MODULE_HREF,
  MODULES,
  PRODUCT_LINKS,
} from "@/components/marketing/marketingContent"

describe("marketing module portfolio", () => {
  test("exposes all ten product modules through their canonical routes", () => {
    const expectedRoutes = [
      "/invoiceguard",
      "/deposit-guard",
      "/spendleak",
      "/owners-digest",
      "/costguard",
      "/commitguard",
      "/margin-guard",
      "/cashplan",
      "/tax-buffer",
      "/runway-guard",
    ]

    for (const route of expectedRoutes) {
      assert.equal(PRODUCT_LINKS.some((link) => link.href === route), true, `${route} is discoverable`)
    }
  })

  test("uses consistent primary CTA wording and destinations for each signup mode", () => {
    assert.deepEqual(
      (({ label, href }) => ({ label, href }))(getJourneyCta("hero", true)),
      { label: "Start your free trial", href: "/sign-up" },
    )
    assert.deepEqual(
      (({ label, href }) => ({ label, href }))(getJourneyCta("hero", false)),
      { label: "Request early access", href: "/contact" },
    )
  })

  test("includes DepositGuard in the shared module catalog and route map", () => {
    const depositGuard = getModuleById("deposit-guard")

    assert.equal(depositGuard.name, "DepositGuard")
    assert.equal(depositGuard.href, "/deposit-guard")
    assert.equal(depositGuard.platformArea, "get-paid")
    assert.equal(MODULE_HREF["deposit-guard"], "/deposit-guard")

    assert.equal(
      MODULES.some((moduleDef) => moduleDef.id === "deposit-guard"),
      true,
    )
    assert.equal(
      PRODUCT_LINKS.some((link) => link.href === "/deposit-guard"),
      true,
    )
  })

  test("surfaces DepositGuard in portfolio navigation groups", () => {
    const getPaidModules = getModulesByPlatformArea("get-paid")

    assert.equal(
      getPaidModules.some((moduleDef) => moduleDef.id === "deposit-guard"),
      true,
    )

    const related = getRelatedModules("deposit-guard")
    assert.equal(related.some((moduleDef) => moduleDef.id === "paidsoon"), true)
  })

  test("labels planned DepositGuard expansions as planned in marketing copy", () => {
    const depositGuard = getModuleById("deposit-guard")
    const copy = [
      ...depositGuard.workflow,
      ...depositGuard.faq.map((item) => `${item.q} ${item.a}`),
      depositGuard.disclaimer ?? "",
    ].join(" ")

    assert.match(copy, /planned/i)
    assert.match(copy, /manual/i)
  })
})
