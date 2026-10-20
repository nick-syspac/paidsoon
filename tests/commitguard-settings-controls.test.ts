import assert from "node:assert/strict"
import { before, mock, test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CommitGuardSettingsSchema, parseCommitGuardWarningDraft } from "@/lib/commitguard/settingsSchema"
import { CommitGuardSettingsImportSchema } from "@/lib/commitguard/settingsTransfer"
import { workspaceSettings } from "@/tests/helpers/commitGuardWorkspace"

let Settings: typeof import("@/components/settings/CommitGuardSettingsClient").CommitGuardSettingsClient
before(async () => {
  await mock.module("next/navigation", { namedExports: { useRouter: () => ({ refresh: () => {} }) } })
  Settings = (await import("@/components/settings/CommitGuardSettingsClient")).CommitGuardSettingsClient
})

test("7.6 warning drafts reject empty/partial/malformed tokens rather than dropping them, rounding or restoring defaults", () => {
  for (const text of ["", " ", ",", "30,", ",7", "30,,7", "0", "-1", "1.5", "1e2", "0x10", "NaN", "Infinity", "366", "7,invalid", Array(13).fill("7").join(",")]) {
    assert.equal(parseCommitGuardWarningDraft(text), null, text)
  }
  assert.deepEqual(parseCommitGuardWarningDraft(" 7, 30,7,365 "), [365, 30, 7])
  assert.deepEqual(parseCommitGuardWarningDraft("1"), [1])
  assert.deepEqual(parseCommitGuardWarningDraft("365"), [365])
})

test("7.6 explicit empty warning writes/imports reject; omitted policy remains a valid no-op", () => {
  for (const schema of [CommitGuardSettingsSchema, CommitGuardSettingsImportSchema]) {
    for (const days of [[], [0], [366], [1.5], ["7"], Array(13).fill(7)]) assert.equal(schema.safeParse({ renewalWarningDays: days }).success, false)
    assert.deepEqual(schema.parse({}), {})
    assert.deepEqual(schema.parse({ defaultHorizonDays: 60 }), { defaultHorizonDays: 60 })
    assert.deepEqual(schema.parse({ renewalWarningDays: [1, 7, 365] }), { renewalWarningDays: [1, 7, 365] })
  }
})

test("7.6 actual settings renderer exposes currency-tagged exact cents, weeks and separate dated-basis navigation", () => {
  const html = renderToStaticMarkup(createElement(Settings, { settings: { ...workspaceSettings,
    safetyBufferFixedCents: 12345, safetyBufferCurrency: "usd", safetyBufferWeeks: 4 } }))
  for (const text of ['name="enabled"', 'name="defaultHorizonDays"', 'name="safetyBufferCurrency"',
    'value="usd" selected=""', 'value="123.45"', 'name="safetyBufferWeeks"', 'value="4"',
    '/dashboard/commitguard#cash-inputs', "UTC attestation date", "Policy saves do not renew that date",
    'name="detectionMinOccurrences"', 'min="2"', 'max="10"', 'name="renewalWarningDays"',
    "automated evaluation", "history is retained", "next-30-days metric"]) assert.ok(html.includes(text), text)
  assert.equal(html.includes("A$"), false)
  for (const field of ["weeklyOperatingExpensesCents", "weeklyExpensesCurrency", "weeklyExpensesAsOf", "amountCents", "balanceAsOf"]) assert.equal(html.includes(`name="${field}"`), false)
})

test("7.6 missing weeks/percent stay empty, not implicit zero; legacy buffer currency remains unknown", () => {
  const html = renderToStaticMarkup(createElement(Settings, { settings: workspaceSettings }))
  assert.match(html, /name="safetyBufferWeeks"[^>]*value=""/)
  assert.match(html, /name="safetyBufferPercent"[^>]*value=""/)
  assert.match(html, /value="" selected="">Unknown — confirm currency/)
})