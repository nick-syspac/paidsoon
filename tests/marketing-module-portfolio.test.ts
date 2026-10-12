import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  getModuleById,
  getModulesByPlatformArea,
  getRelatedModules,
  getJourneyCta,
  CANONICAL_FEATURE_ROUTES,
  MARKETING_REDIRECTS,
  MODULE_HREF,
  MODULES,
  PRODUCT_LINKS,
  HOMEPAGE_HERO,
  PLATFORM_CYCLE,
  SOLUTION_GROUPS,
  type MarketingModuleId,
} from "@/components/marketing/marketingContent"
import {
  getStaticMarketingSitemapRoutes,
  MARKETING_SITE_ORIGIN,
  PUBLIC_MARKETING_ROUTES,
  buildMarketingMetadata,
} from "@/lib/marketing/seo"

describe("marketing module portfolio", () => {
  test("exposes all ten product modules through their canonical routes", () => {
    const expectedModules: Array<[MarketingModuleId, string, string]> = [
      ["paidsoon", "InvoiceGuard", "/features/invoiceguard"],
      ["spendleak", "Unnecessary Spending", "/features/unnecessary-spending"],
      ["costguard", "Spending Controls", "/features/spending-controls"],
      ["cashplan", "Cash Flow Planner", "/features/cash-flow-planner"],
      ["deposit-guard", "Deposits & Upfront Payments", "/features/deposits-upfront-payments"],
      ["tax-buffer", "Tax Set-Aside", "/features/tax-set-aside"],
      ["commitguard", "Upcoming Bills & Commitments", "/features/upcoming-bills-commitments"],
      ["margin-guard", "Profit Monitor", "/features/profit-monitor"],
      ["runway-guard", "Cash Runway", "/features/cash-runway"],
      ["owners-digest", "Your Business Snapshot", "/features/business-snapshot"],
    ]

    for (const [id, name, route] of expectedModules) {
      const moduleDef = getModuleById(id)
      assert.equal(moduleDef.name, name)
      assert.equal(moduleDef.href, route)
      assert.equal(moduleDef.canonicalHref, route)
      assert.equal(PRODUCT_LINKS.some((link) => link.href === route && link.label === name), true, `${route} is discoverable`)
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

  test("uses the approved platform-first hero and outcome pillars", () => {
    assert.equal(HOMEPAGE_HERO.eyebrow, "Financial control for Australian businesses")
    assert.equal(HOMEPAGE_HERO.headline, "Take control of your cash flow, costs and business finances")
    assert.match(HOMEPAGE_HERO.supporting, /unnecessary spending.*upcoming bills.*overdue invoices.*PaidSoon/i)
    assert.equal(HOMEPAGE_HERO.invoiceModule, "InvoiceGuard — automated invoice follow-ups to help you get paid sooner.")
    assert.match(HOMEPAGE_HERO.finopsExplanation, /FinOps means managing business spending, cash flow and financial performance/i)
    assert.equal(HOMEPAGE_HERO.secondaryCta, "Explore the features")
    assert.equal(HOMEPAGE_HERO.secondaryHref, "/features")
    assert.deepEqual(PLATFORM_CYCLE, ["Get Paid", "Control Costs", "Plan Ahead", "Stop Waste"])
    assert.deepEqual(SOLUTION_GROUPS.map((group) => group.label), ["Get Paid", "Control Costs", "Plan Ahead", "Stop Waste"])
  })

  test("maps every former module URL directly to its canonical feature page", () => {
    const redirects = new Map(MARKETING_REDIRECTS.map(({ source, destination }) => [source, destination]))
    const expectedDestinations = new Map<string, string>([
      ["/paidsoon", "/features/invoiceguard"],
      ["/invoiceguard", "/features/invoiceguard"],
      ["/spendleak", "/features/unnecessary-spending"],
      ["/costguard", "/features/spending-controls"],
      ["/cashplan", "/features/cash-flow-planner"],
      ["/deposit-guard", "/features/deposits-upfront-payments"],
      ["/tax-buffer", "/features/tax-set-aside"],
      ["/commitguard", "/features/upcoming-bills-commitments"],
      ["/margin-guard", "/features/profit-monitor"],
      ["/runway-guard", "/features/cash-runway"],
      ["/owners-digest", "/features/business-snapshot"],
      ["/accountants", "/features/client-manager"],
    ])

    assert.deepEqual(redirects, expectedDestinations)
    assert.equal(CANONICAL_FEATURE_ROUTES.length, 11)
    assert.equal(new Set(CANONICAL_FEATURE_ROUTES.map(({ href }) => href)).size, 11)
  })

  test("publishes only canonical feature routes with absolute production SEO URLs", () => {
    const sitemapRoutes = getStaticMarketingSitemapRoutes()
    for (const { href } of CANONICAL_FEATURE_ROUTES) {
      assert.equal(PUBLIC_MARKETING_ROUTES.filter((route) => route === href).length, 1)
      assert.equal(sitemapRoutes.filter(({ url }) => url === `${MARKETING_SITE_ORIGIN}${href}`).length, 1)
    }

    for (const oldPath of MARKETING_REDIRECTS.map(({ source }) => source)) {
      assert.equal(PUBLIC_MARKETING_ROUTES.includes(oldPath as (typeof PUBLIC_MARKETING_ROUTES)[number]), false)
      assert.equal(sitemapRoutes.some(({ url }) => url === `${MARKETING_SITE_ORIGIN}${oldPath}`), false)
    }

    const metadata = buildMarketingMetadata({
      title: "Test feature",
      description: "Feature metadata",
      canonicalPath: "/features/invoiceguard",
    })
    assert.equal(metadata.alternates?.canonical, `${MARKETING_SITE_ORIGIN}/features/invoiceguard`)
    assert.equal(metadata.openGraph?.url, `${MARKETING_SITE_ORIGIN}/features/invoiceguard`)
    assert.deepEqual(metadata.openGraph?.images, [{
      url: `${MARKETING_SITE_ORIGIN}/social/paidsoon-og.svg`,
      alt: "Test feature",
    }])
  })

  test("includes DepositGuard in the shared module catalog and route map", () => {
    const depositGuard = getModuleById("deposit-guard")

    assert.equal(depositGuard.name, "Deposits & Upfront Payments")
    assert.equal(depositGuard.href, "/features/deposits-upfront-payments")
    assert.equal(depositGuard.platformArea, "get-paid")
    assert.equal(MODULE_HREF["deposit-guard"], "/features/deposits-upfront-payments")

    assert.equal(
      MODULES.some((moduleDef) => moduleDef.id === "deposit-guard"),
      true,
    )
    assert.equal(
      PRODUCT_LINKS.some((link) => link.href === "/features/deposits-upfront-payments"),
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

  test("surfaces Client Manager as planned and links to its canonical destination", () => {
    const clientManager = getModuleById("client-manager")
    const getPaidModules = getModulesByPlatformArea("get-paid")

    assert.equal(clientManager.name, "Client Manager")
    assert.equal(clientManager.href, "/features/client-manager")
    assert.equal(clientManager.availabilityStatus, "coming_soon")
    assert.equal(clientManager.statusLabel, "Multi-client tools coming soon")
    assert.equal(MODULE_HREF["client-manager"], "/features/client-manager")
    assert.equal(
      PRODUCT_LINKS.some((link) => link.label === "Client Manager" && link.href === "/features/client-manager"),
      true,
    )
    assert.equal(getPaidModules.some((moduleDef) => moduleDef.id === "client-manager"), true)
    assert.match(clientManager.faq[0].a, /planned/i)
    assert.match(clientManager.disclaimer ?? "", /not yet available/i)
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
