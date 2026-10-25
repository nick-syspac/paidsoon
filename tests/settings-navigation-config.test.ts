import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  SETTINGS_NAV_GROUPS,
  findActiveSettingsGroup,
  findActiveSettingsItem,
  getSettingsDiscoveryEntries,
  getVisibleSettingsNavGroups,
  isSettingsItemActive,
} from "@/lib/settings/navigation"

describe("settings navigation configuration", () => {
  test("groups settings by module and preserves canonical routes in order", () => {
    const groups = SETTINGS_NAV_GROUPS.map((group) => ({
      label: group.label,
      order: group.order,
      items: group.items.map((item) => item.label),
    }))

    assert.deepEqual(groups[0], {
      label: "General",
      order: 1,
      items: ["Account", "Connections", "Team", "Subscription"],
    })

    assert.deepEqual(groups[1], {
      label: "InvoiceGuard",
      order: 2,
      items: ["Schedule", "Email", "Templates", "Import / Export"],
    })

    assert.deepEqual(groups[2], {
      label: "DepositGuard",
      order: 3,
      items: ["DepositGuard"],
    })

    assert.deepEqual(groups[3], {
      label: "SpendLeak",
      order: 4,
      items: ["SpendLeak"],
    })

    assert.deepEqual(groups[4], {
      label: "Owner's Digest",
      order: 5,
      items: ["Owner's Digest"],
    })

    assert.deepEqual(groups[5], {
      label: "CommitGuard",
      order: 6,
      items: ["CommitGuard"],
    })

    assert.deepEqual(groups[6], {
      label: "CostGuard",
      order: 7,
      items: ["Cost Guard"],
    })

    assert.deepEqual(groups[7], {
      label: "MarginGuard",
      order: 8,
      items: ["MarginGuard"],
    })

    assert.deepEqual(groups[8], {
      label: "RunwayGuard",
      order: 9,
      items: ["RunwayGuard"],
    })

    assert.deepEqual(groups[9], {
      label: "TaxBuffer",
      order: 10,
      items: ["Tax Buffer"],
    })

    assert.deepEqual(groups[10], {
      label: "CashPlan",
      order: 11,
      items: ["Forecast settings"],
    })
  })

  test("matches the currently active settings page across nested routes", () => {
    assert.equal(isSettingsItemActive("/settings/connections", "/settings/connections"), true)
    assert.equal(isSettingsItemActive("/settings/connections?source=xero", "/settings/connections"), true)
    assert.equal(isSettingsItemActive("/settings/cash-plan", "/settings/cash-plan"), true)
    assert.equal(isSettingsItemActive("/settings/cash-plan/assumptions", "/settings/cash-plan"), true)
    assert.equal(isSettingsItemActive("/settings/account", "/settings/connections"), false)
  })

  test("returns the active item for a nested route", () => {
    const active = findActiveSettingsItem("/settings/cash-plan")
    assert.equal(active?.label, "Forecast settings")
    assert.equal(active?.href, "/settings/cash-plan")
  })

  test("returns the active group for a nested route", () => {
    const groups = getVisibleSettingsNavGroups("small_business")
    const active = findActiveSettingsGroup("/settings/cash-plan", groups)
    assert.equal(active?.id, "cashplan")
    assert.equal(active?.label, "CashPlan")
  })

  test("returns the CommitGuard item for commitguard settings routes", () => {
    const active = findActiveSettingsItem("/settings/commitguard")
    assert.equal(active?.label, "CommitGuard")
    assert.equal(active?.href, "/settings/commitguard")
  })

  test("shows SpendLeak settings only for eligible tiers", () => {
    const essentialsGroups = getVisibleSettingsNavGroups("essentials")
    const smallBusinessGroups = getVisibleSettingsNavGroups("small_business")

    const essentialsSpendLeak = essentialsGroups.find((group) => group.id === "spendleak")
    const smallBusinessSpendLeak = smallBusinessGroups.find((group) => group.id === "spendleak")

    assert.equal(essentialsSpendLeak, undefined)
    assert.equal(smallBusinessSpendLeak?.items.some((item) => item.href === "/settings/spendleak"), true)
  })

  test("builds discoverable terms without exposing ineligible settings", () => {
    const essentialsEntries = getSettingsDiscoveryEntries(getVisibleSettingsNavGroups("essentials"))
    const smallBusinessEntries = getSettingsDiscoveryEntries(getVisibleSettingsNavGroups("small_business"))

    assert.equal(essentialsEntries.some((entry) => entry.href === "/settings/spendleak"), false)
    assert.equal(smallBusinessEntries.some((entry) => entry.href === "/settings/spendleak"), true)

    const connectionEntry = smallBusinessEntries.find((entry) => entry.href === "/settings/connections")
    assert.ok(connectionEntry)
    assert.equal(connectionEntry?.terms.includes("xero"), true)
    assert.equal(connectionEntry?.terms.includes("integrations"), true)
  })
})
