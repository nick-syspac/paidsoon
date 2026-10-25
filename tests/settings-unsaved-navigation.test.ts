import assert from "node:assert/strict"
import { describe, test } from "node:test"

import { isDraftDirty, resolvePersistedDraft } from "@/lib/settings/editDraft"
import {
  shouldConfirmLeaveSettings,
  shouldInterceptSettingsNavigationTarget,
} from "@/lib/settings/unsavedNavigation"

describe("settings unsaved-navigation helpers", () => {
  test("intercepts only same-origin settings routes", () => {
    const origin = "https://app.paidsoon.com"

    assert.equal(shouldInterceptSettingsNavigationTarget("/settings/account", origin), true)
    assert.equal(shouldInterceptSettingsNavigationTarget("https://app.paidsoon.com/settings/email", origin), true)
    assert.equal(shouldInterceptSettingsNavigationTarget("/dashboard", origin), false)
    assert.equal(shouldInterceptSettingsNavigationTarget("https://example.com/settings/account", origin), false)
  })

  test("requires unsaved changes before leave confirmation", () => {
    const origin = "https://app.paidsoon.com"
    assert.equal(shouldConfirmLeaveSettings(false, "/settings/account", origin), false)
    assert.equal(shouldConfirmLeaveSettings(true, "/settings/account", origin), true)
    assert.equal(shouldConfirmLeaveSettings(true, "/dashboard", origin), false)
  })
})

describe("settings draft helpers", () => {
  test("detects when draft has pending edits", () => {
    assert.equal(
      isDraftDirty(
        { subject: "Reminder", retryDays: 3 },
        { subject: "Reminder", retryDays: 3 },
      ),
      false,
    )

    assert.equal(
      isDraftDirty(
        { subject: "Reminder", retryDays: 5 },
        { subject: "Reminder", retryDays: 3 },
      ),
      true,
    )
  })

  test("preserves persisted baseline on failed saves and advances on success", () => {
    const draft = { subject: "Final notice", retryDays: 7 }
    const persisted = { subject: "Reminder", retryDays: 3 }

    assert.deepEqual(resolvePersistedDraft(draft, persisted, false), persisted)
    assert.deepEqual(resolvePersistedDraft(draft, persisted, true), draft)
  })
})
