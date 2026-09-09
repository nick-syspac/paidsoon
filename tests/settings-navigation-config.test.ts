import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  SETTINGS_NAV_GROUPS,
  findActiveSettingsItem,
  isSettingsItemActive,
} from "@/lib/settings/navigation"

describe("settings navigation configuration", () => {
  test("groups settings by module and preserves canonical routes", () => {
    const groups = SETTINGS_NAV_GROUPS.map((group) => ({
      label: group.label,
      items: group.items.map((item) => item.label),
    }))

    assert.deepEqual(groups[0], {
      label: "General",
      items: ["Account", "Connections", "Team", "Subscription"],
    })

    assert.deepEqual(groups[1], {
      label: "PaidSoon",
      items: ["Schedule", "Email", "Templates", "Import / Export"],
    })

    assert.deepEqual(groups[2], {
      label: "SpendLeak",
      items: [],
    })

    assert.deepEqual(groups[3], {
      label: "CommitGuard",
      items: ["CommitGuard"],
    })

    assert.deepEqual(groups[4], {
      label: "CostGuard",
      items: ["Cost Guard"],
    })

    assert.deepEqual(groups[5], {
      label: "MarginGuard",
      items: ["MarginGuard"],
    })

    assert.deepEqual(groups[6], {
      label: "RunwayGuard",
      items: ["RunwayGuard"],
    })

    assert.deepEqual(groups[7], {
      label: "TaxBuffer",
      items: ["Tax Buffer"],
    })

    assert.deepEqual(groups[8], {
      label: "CashPlan",
      items: ["Forecast settings"],
    })
  })

  test("matches the currently active settings page across nested routes", () => {
    assert.equal(isSettingsItemActive("/dashboard/settings/connections", "/dashboard/settings/connections"), true)
    assert.equal(isSettingsItemActive("/dashboard/settings/connections?source=xero", "/dashboard/settings/connections"), true)
    assert.equal(isSettingsItemActive("/dashboard/settings/cash-plan", "/dashboard/settings/cash-plan"), true)
    assert.equal(isSettingsItemActive("/dashboard/settings/cash-plan/assumptions", "/dashboard/settings/cash-plan"), true)
    assert.equal(isSettingsItemActive("/dashboard/settings/account", "/dashboard/settings/connections"), false)
  })

  test("returns the active item for a nested route", () => {
    const active = findActiveSettingsItem("/dashboard/settings/cash-plan")
    assert.equal(active?.label, "Forecast settings")
    assert.equal(active?.href, "/dashboard/settings/cash-plan")
  })

  test("returns the CommitGuard item for commitguard settings routes", () => {
    const active = findActiveSettingsItem("/dashboard/settings/commitguard")
    assert.equal(active?.label, "CommitGuard")
    assert.equal(active?.href, "/dashboard/settings/commitguard")
  })
})
