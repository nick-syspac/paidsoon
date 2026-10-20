import assert from "node:assert/strict"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, test } from "node:test"
import { CommitGuardCashContextForm } from "@/components/dashboard/commitguard/CommitGuardCashContextForm"
import { toCommitGuardCashContextDto } from "@/lib/commitguard/cashContext"

const now = new Date("2026-10-19T12:00:00Z")
const empty = toCommitGuardCashContextDto(null, now)
const neverRequest = async (): Promise<Response> => { throw new Error("SSR must not fetch") }

describe("CommitGuard rendered cash-input form", () => {
  test("renders every accessible label paired to its control without a DOM dependency", () => {
    const html = renderToStaticMarkup(createElement(CommitGuardCashContextForm, { initialContext: empty, request: neverRequest, onRefresh: () => {} }))
    for (const [key, label] of Object.entries({ amount: "Gross cash balance amount", currency: "Cash balance currency", balanceAsOf: "Balance as of (UTC)", weeklyAmount: "Weekly operating expenses amount", weeklyCurrency: "Weekly expense currency", weeklyAsOf: "Weekly expenses as of (UTC)", taxCurrency: "Tax-protection currency" })) {
      assert.ok(html.includes(`<label for="commitguard-cash-${key}"`), label)
      assert.ok(html.includes(`id="commitguard-cash-${key}"`), label)
      assert.ok(html.includes(`id="commitguard-cash-${key}-hint"`), label)
      assert.ok(html.includes(label), label)
    }
    for (const code of ["AUD", "USD", "NZD", "GBP", "EUR", "CAD", "SGD", "HKD"]) assert.ok(html.includes(`>${code}</option>`))
    assert.ok(!html.includes(">JPY</option>"))
    assert.match(html, /Owner-entered, not bank-verified/)
    assert.match(html, /No bank or provider balance sync/)
    assert.match(html, /Add missing cash balance/)
    assert.match(html, /Add weekly expense basis/)
    assert.match(html, /Clear balance fields/)
    assert.match(html, /Clear weekly expense fields/)
    assert.match(html, /Save cash inputs/)
    assert.match(html, /Missing is not zero/)
    assert.match(html, /<legend[^>]*>Tax-protection currency attestation/)
  })

  test("stale signed balances, explicit zero expenses, source dates and independent currencies stay visible", () => {
    const html = renderToStaticMarkup(createElement(CommitGuardCashContextForm, { initialContext: { ...empty, amountCents: -29, currency: "usd", balanceAsOf: "2026-10-11", freshness: "stale", weeklyOperatingExpensesCents: 0, weeklyExpensesCurrency: "aud", weeklyExpensesAsOf: "2026-10-11", weeklyExpensesFreshness: "stale" }, request: neverRequest, onRefresh: () => {} }))
    assert.match(html, /-0.29 USD as of 2026-10-11 \(UTC\) — stale/)
    assert.match(html, /0.00 AUD as of 2026-10-11 \(UTC\) — stale/)
    assert.match(html, /Update stale cash balance/)
    assert.match(html, /Update stale weekly expense basis/)
    assert.match(html, /value="-0.29"/)
    assert.match(html, /value="0.00"/)
  })

  test("initial loading is accessible and mutations are disabled until the DTO is loaded", () => {
    const html = renderToStaticMarkup(createElement(CommitGuardCashContextForm, { request: neverRequest, onRefresh: () => {} }))
    assert.match(html, /role="status"/)
    assert.match(html, /No cash context loaded yet/)
    assert.match(html, /<fieldset disabled=""/)
    assert.match(html, /<button type="submit" disabled=""/)
  })
})