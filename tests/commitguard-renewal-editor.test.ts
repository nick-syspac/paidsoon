import assert from "node:assert/strict"
import { test } from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { annualizedRenewalAmount, selectWorkspaceRenewals, renewalPageHref } from "@/lib/commitguard/renewalPresentation"
import { commitmentEditDraft, commitmentDraftPatch, CommitmentDateInputSchema } from "@/lib/commitguard/commitmentEditor"
import { WorkspaceQuerySchema, commitmentPageHref } from "@/lib/commitguard/workspaceFilters"
import { alertPageHref } from "@/lib/commitguard/alertPresentation"
import { CommitGuardRenewals } from "@/components/dashboard/commitguard/CommitGuardRenewals"
import { CommitGuardUpcoming } from "@/components/dashboard/commitguard/CommitGuardUpcoming"
import { syntheticWorkspace } from "@/tests/helpers/commitGuardWorkspace"

for (const [frequency, factor] of Object.entries({ weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, six_monthly: 2, annual: 1 })) {
  test(`7.5 annualized source currency: ${frequency} uses exactly x${factor}`, () => {
    assert.equal(annualizedRenewalAmount(12345, frequency), 12345 * factor)
    assert.equal(annualizedRenewalAmount(0, frequency), 0)
  })
}
test("7.5 annualization never guesses one-off/custom/unknown cadence, unsafe values or a conversion", () => {
  for (const frequency of ["one_off", "custom", "daily", "__proto__", "constructor"]) assert.equal(annualizedRenewalAmount(0, frequency), null)
  for (const amount of [NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER]) assert.equal(annualizedRenewalAmount(amount, "weekly"), null)
})

test("7.5 independent validated renewal pages expose 19 tied rows exactly once, clamp and preserve every URL parameter", () => {
  const dto = syntheticWorkspace()
  const rows = Array.from({ length: 19 }, (_, i) => ({ ...dto.summary.renewals[0], commitmentId: `id-${String(i).padStart(2, "0")}` })).reverse()
  const params = WorkspaceQuerySchema.parse({ search: "unrelated", category: "missing", source: "manual", status: "expired",
    page: "4", alertPage: "5", costGuardAlertId: "alert-1", linkedSpendInsightId: "insight-1", eventId: "event-1", commitmentId: "id-01" })
  const pages = ["1", "2", "3"].map((renewalPage) => selectWorkspaceRenewals(rows, { ...params, renewalPage }))
  assert.deepEqual(pages.map((page) => page.items.length), [8, 8, 3])
  assert.equal(new Set(pages.flatMap((page) => page.items.map((row) => row.commitmentId))).size, 19)
  assert.equal(selectWorkspaceRenewals(rows, { renewalPage: "9007199254740991" }).page, 3)
  assert.equal(selectWorkspaceRenewals(rows, { renewalPage: "-1" }).page, 1)
  assert.equal(selectWorkspaceRenewals([], { renewalPage: "3" }).page, 1)
  for (const value of ["1.5", "Infinity", "NaN", "1e2", "9007199254740992"]) assert.equal(WorkspaceQuerySchema.safeParse({ renewalPage: value }).success, false)
  const href = new URL(renewalPageHref(params, 2), "http://localhost")
  assert.equal(href.hash, "#commitguard-renewals")
  for (const [key, value] of Object.entries(params)) assert.equal(href.searchParams.get(key), value)
  for (const href of [commitmentPageHref({ ...params, renewalPage: "3" }, 2), alertPageHref({ ...params, renewalPage: "3" }, 2)]) {
    assert.equal(new URL(href, "http://localhost").searchParams.get("renewalPage"), "3")
  }
  const html = renderToStaticMarkup(createElement(CommitGuardUpcoming, { upcoming: dto.upcoming, params: { ...params, renewalPage: "3" } }))
  assert.match(html, /name="renewalPage" value="3"/)
  assert.match(html, /renewalPage=3/)
})

test("7.5 renewal renderer labels mixed source currencies, cents, notice duration/missed/today, cadence and unavailable context", () => {
  const dto = syntheticWorkspace()
  const commitments = ["monthly", "weekly", "one_off", "custom"].map((frequency, i) => ({ ...dto.commitments[0], id: `id-${i}`,
    name: `Synthetic ${i}`, currency: i === 1 ? "usd" : "aud", amountCents: 12345, frequency, noticePeriodDays: i === 3 ? null : 30, autoRenew: i === 0 }))
  const renewals = commitments.map((row, i) => ({ ...dto.summary.renewals[0], commitmentId: row.id, name: row.name, daysToNoticeClose: i - 1 }))
  const html = renderToStaticMarkup(createElement(CommitGuardRenewals, { renewals, commitments, params: {} }))
  for (const text of ["AUD source currency; monthly", "USD source currency; weekly", "1,481.40", "6,419.40", "Notice period: 30 days",
    "Notice deadline missed by 1 day", "Notice deadline is today", "1 day remaining to act", "Auto-renews: Yes", "Auto-renews: No",
    "Unavailable — one-off, unsupported recurrence or incomplete amount context", "Not set (assessment uses 0 days)", "Renewal pagination", "No mixed-currency total"]) assert.ok(html.includes(text), text)
  assert.equal((html.match(/Unavailable — one-off/g) ?? []).length, 2)
  assert.equal((html.match(/Source amount:/g) ?? []).length, 4)
  assert.ok(html.includes("Frequency: one off"))
  assert.ok(html.includes("Frequency: custom"))
  assert.ok(!html.includes("$0.00"))
})

test("7.5 draft patch sends all supported classification/renewal fields, not status, and preserves unchanged custom schedules and date instants", () => {
  const row = { ...syntheticWorkspace().commitments[0], frequency: "custom", nextDueDate: "2026-10-21T12:15:00Z" }
  const draft = commitmentEditDraft(row)
  assert.deepEqual(commitmentDraftPatch(row, draft), { patch: {}, errors: {} })
  const edit = { ...draft, name: "Renamed", category: "insurance", confidence: "low", essentiality: "critical", source: "import",
    renewalDate: "2027-02-28", noticePeriodDays: "0", autoRenew: "false", cancellable: "false", description: "Context", supplierName: "Supplier", notes: "Draft" }
  const { patch, errors } = commitmentDraftPatch(row, edit)
  assert.deepEqual(errors, {})
  assert.deepEqual(patch, { name: "Renamed", category: "insurance", confidence: "low", essentiality: "critical", source: "import",
    renewalDate: "2027-02-28T00:00:00.000Z", noticePeriodDays: 0, autoRenew: false, cancellable: false, description: "Context", supplierName: "Supplier", notes: "Draft" })
  assert.equal("frequency" in patch, false); assert.equal("nextDueDate" in patch, false); assert.equal("status" in patch, false)
  assert.equal(commitmentDraftPatch(row, { ...draft, renewalDate: "", noticePeriodDays: "" }).patch.renewalDate, null)
  assert.equal(commitmentDraftPatch(row, { ...draft, frequency: "annual" }).patch.frequency, "annual")
})

test("7.5 invalid calendar dates and numeric drafts stay field errors; ISO route dates never silently roll over", () => {
  const row = syntheticWorkspace().commitments[0], draft = commitmentEditDraft(row)
  for (const renewalDate of ["2026-02-30", "not-a-date", "2026-13-01"]) assert.ok(commitmentDraftPatch(row, { ...draft, renewalDate }).errors.renewalDate)
  for (const noticePeriodDays of ["-1", "1.5", "366", "NaN"]) assert.ok(commitmentDraftPatch(row, { ...draft, noticePeriodDays }).errors.noticePeriodDays)
  for (const amountCents of ["", "-1", "1.999", "NaN", "21474836.48"]) assert.ok(commitmentDraftPatch(row, { ...draft, amountCents }).errors.amountCents)
  for (const input of ["2026-02-30", "2026-02-30T00:00:00.000Z", "garbage", "", 123]) assert.equal(CommitmentDateInputSchema.safeParse(input).success, false)
  for (const input of ["2028-02-29", "2026-10-19T12:00:00Z", "2026-10-19T12:00:00+10:00"]) assert.equal(CommitmentDateInputSchema.safeParse(input).success, true)
})