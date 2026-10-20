import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  assessRenewalSeverity,
  buildCommitmentHorizonTotals,
  buildCommitmentHorizonsByCurrency,
  buildCommitmentProtection,
  buildRenewalAssessments,
  calculateFreeCashBreakdown,
  CommitmentProjectionError,
  projectCommitmentOccurrences,
  resolveSafetyBufferCents,
} from "@/lib/commitguard/engine"
import type { CommitmentSnapshot, CommitGuardSettingsSnapshot } from "@/lib/commitguard/types"

function buildCommitment(input: Partial<CommitmentSnapshot>): CommitmentSnapshot {
  return {
    id: input.id ?? "commitment-1",
    userId: input.userId ?? "user-1",
    name: input.name ?? "Software subscription",
    description: input.description ?? null,
    category: input.category ?? "software",
    amountCents: input.amountCents ?? 25_000,
    currency: input.currency ?? "aud",
    frequency: input.frequency ?? "monthly",
    nextDueDate: input.nextDueDate ?? new Date("2026-09-01T00:00:00.000Z"),
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    recurrenceRule: input.recurrenceRule ?? null,
    supplierName: input.supplierName ?? null,
    supplierId: input.supplierId ?? null,
    accountId: input.accountId ?? null,
    source: input.source ?? "manual",
    status: input.status ?? "active",
    confidence: input.confidence ?? "confirmed",
    noticePeriodDays: input.noticePeriodDays ?? null,
    renewalDate: input.renewalDate ?? null,
    autoRenew: input.autoRenew ?? false,
    cancellable: input.cancellable ?? true,
    essentiality: input.essentiality ?? "operational",
    notes: input.notes ?? null,
    linkedSpendInsightId: input.linkedSpendInsightId ?? null,
    linkedCostGuardAlertId: input.linkedCostGuardAlertId ?? null,
    archivedAt: input.archivedAt ?? null,
    createdAt: input.createdAt ?? new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-08-01T00:00:00.000Z"),
  }
}

describe("CommitGuard engine", () => {
  test("projects recurring monthly occurrences with day-of-month clamping", () => {
    const commitment = buildCommitment({
      frequency: "monthly",
      nextDueDate: new Date("2028-01-31T00:00:00.000Z"),
    })

    const occurrences = projectCommitmentOccurrences({
      commitment,
      windowStart: new Date("2028-01-01T00:00:00.000Z"),
      windowEnd: new Date("2028-04-01T00:00:00.000Z"),
    })

    assert.equal(occurrences.length, 3)
    assert.equal(occurrences[0].dueDate.toISOString().slice(0, 10), "2028-01-31")
    assert.equal(occurrences[1].dueDate.toISOString().slice(0, 10), "2028-02-29")
    assert.equal(occurrences[2].dueDate.toISOString().slice(0, 10), "2028-03-31")
  })

  function dates(commitment: Partial<CommitmentSnapshot>, start: string, end: string, maxOccurrences?: number): string[] {
    return projectCommitmentOccurrences({
      commitment: buildCommitment(commitment),
      windowStart: new Date(start),
      windowEnd: new Date(end),
      maxOccurrences,
    }).map((row) => row.dueDate.toISOString().slice(0, 10))
  }

  function projectionError(code: CommitmentProjectionError["code"]): (error: unknown) => boolean {
    return (error) => error instanceof CommitmentProjectionError && error.code === code
  }

  test("skips centuries of weekly and fortnightly history without consuming the row budget", () => {
    for (const frequency of ["weekly", "fortnightly"] as const) {
      assert.deepEqual(dates({
        frequency,
        nextDueDate: new Date("1900-01-01Z"),
      }, "2026-10-19Z", "2026-11-02Z", 2), frequency === "weekly" ? ["2026-10-19", "2026-10-26"] : ["2026-10-19"])
    }
  })

  test("skips millennia of calendar history mathematically and preserves anchor days", () => {
    for (const [frequency, anchor, expected] of [
      ["monthly", "0001-01-31", ["2028-01-31", "2028-02-29", "2028-03-31"]],
      ["quarterly", "0001-01-31", ["2028-01-31", "2028-04-30", "2028-07-31", "2028-10-31"]],
      ["six_monthly", "0001-08-31", ["2028-02-29", "2028-08-31"]],
      ["annual", "0004-02-29", ["2028-02-29"]],
    ] as const) {
      assert.deepEqual(dates({ frequency, nextDueDate: new Date(`${anchor}T00:00:00Z`) },
        "2028-01-01Z", frequency === "monthly" ? "2028-04-01Z" : "2029-01-01Z", 4), expected)
    }
  })

  test("calendar sequences recover from clamping instead of permanently drifting", () => {
    const cases = [
      { frequency: "monthly", anchor: "2027-01-31", end: "2027-04-01", expected: ["2027-01-31", "2027-02-28", "2027-03-31"] },
      { frequency: "quarterly", anchor: "2027-01-31", end: "2028-02-01", expected: ["2027-01-31", "2027-04-30", "2027-07-31", "2027-10-31", "2028-01-31"] },
      { frequency: "six_monthly", anchor: "2027-08-31", end: "2028-09-01", expected: ["2027-08-31", "2028-02-29", "2028-08-31"] },
      { frequency: "annual", anchor: "2028-02-29", end: "2033-01-01", expected: ["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"] },
    ] as const
    for (const row of cases) {
      assert.deepEqual(dates({ frequency: row.frequency, nextDueDate: new Date(`${row.anchor}T00:00:00Z`) },
        `${row.anchor}T00:00:00Z`, `${row.end}T00:00:00Z`), row.expected)
    }
    // Gregorian century exception, then restoration at the next leap year.
    assert.deepEqual(dates({ frequency: "annual", nextDueDate: new Date("2096-02-29Z") },
      "2100-01-01Z", "2105-01-01Z"), ["2100-02-28", "2101-02-28", "2102-02-28", "2103-02-28", "2104-02-29"])
  })

  test("startDate filters the original nextDueDate sequence, without moving its anchor", () => {
    assert.deepEqual(dates({
      frequency: "monthly", nextDueDate: new Date("2028-01-31Z"), startDate: new Date("2028-02-15Z"),
    }, "2028-01-01Z", "2028-04-01Z"), ["2028-02-29", "2028-03-31"])
    assert.deepEqual(dates({
      frequency: "monthly", nextDueDate: new Date("2028-02-29Z"), startDate: new Date("2028-01-31Z"),
    }, "2028-01-01Z", "2028-04-01Z"), ["2028-02-29", "2028-03-29"])
    assert.deepEqual(dates({
      frequency: "weekly", nextDueDate: new Date("1900-01-01Z"), startDate: new Date("2026-10-20Z"),
    }, "2026-10-19Z", "2026-11-02Z"), ["2026-10-26"])
  })

  test("includes commitment start/end dates only inside the half-open horizon", () => {
    const commitment = { frequency: "weekly" as const, nextDueDate: new Date("2026-10-19Z"),
      startDate: new Date("2026-10-26Z"), endDate: new Date("2026-11-02Z") }
    assert.deepEqual(dates(commitment, "2026-10-19Z", "2026-11-03Z"), ["2026-10-26", "2026-11-02"])
    assert.deepEqual(dates(commitment, "2026-10-19Z", "2026-11-02Z"), ["2026-10-26"])
    assert.deepEqual(dates(commitment, "2026-10-19Z", "2026-10-26Z"), [])
    assert.deepEqual(dates(commitment, "2026-11-03Z", "2026-12-01Z"), [])
    assert.deepEqual(dates({ ...commitment, endDate: commitment.startDate }, "2026-10-19Z", "2026-11-03Z"), ["2026-10-26"])
  })

  test("one-off dates include today and day days-1, exclude day days and empty windows", () => {
    for (const [due, expected] of [
      ["2026-10-18", []], ["2026-10-19", ["2026-10-19"]],
      ["2026-10-25", ["2026-10-25"]], ["2026-10-26", []],
    ] as const) {
      assert.deepEqual(dates({ frequency: "one_off", nextDueDate: new Date(`${due}T23:59:00Z`) },
        "2026-10-19Z", "2026-10-26Z"), expected)
    }
    assert.deepEqual(dates({ frequency: "weekly" }, "2026-09-01Z", "2026-09-01Z"), [])
    assert.deepEqual(dates({ frequency: "one_off", startDate: new Date("2026-09-02Z") }, "2026-09-01Z", "2026-10-01Z"), [])
    assert.deepEqual(dates({ frequency: "one_off", endDate: new Date("2026-08-31Z") }, "2026-09-01Z", "2026-10-01Z"), [])
  })

  test("uses UTC dates across offsets and daylight-saving transitions, without mutating inputs", () => {
    const anchor = new Date("2026-10-04T00:30:00+10:00") // UTC October 3
    const start = new Date("2026-10-03T23:30:00-07:00") // UTC October 4
    const end = new Date("2026-10-18T00:30:00+11:00") // UTC October 17
    const before = [anchor.getTime(), start.getTime(), end.getTime()]
    const rows = projectCommitmentOccurrences({
      commitment: buildCommitment({ frequency: "weekly", nextDueDate: anchor }), windowStart: start, windowEnd: end,
    })
    assert.deepEqual(rows.map((row) => row.dueDate.toISOString()), ["2026-10-10T00:00:00.000Z"])
    assert.deepEqual([anchor.getTime(), start.getTime(), end.getTime()], before)
  })

  test("excludes archived, paused, cancelled and expired commitments and retains active statuses", () => {
    for (const status of ["paused", "cancelled", "expired"] as const) {
      assert.deepEqual(dates({ status }, "2026-09-01Z", "2026-10-01Z"), [])
    }
    assert.deepEqual(dates({ archivedAt: new Date("2026-08-01Z") }, "2026-09-01Z", "2026-10-01Z"), [])
    assert.deepEqual(dates({ status: "archived" as CommitmentSnapshot["status"] }, "2026-09-01Z", "2026-10-01Z"), [])
    for (const status of ["active", "upcoming", "ending", "review"] as const) {
      assert.deepEqual(dates({ status }, "2026-09-01Z", "2026-10-01Z"), ["2026-09-01"])
    }
  })

  test("preflights emitted-row caps and never returns a silently truncated projection", () => {
    const commitment = { frequency: "weekly" as const, nextDueDate: new Date("1900-01-01Z") }
    assert.deepEqual(dates(commitment, "2026-10-19Z", "2026-11-02Z", 2), ["2026-10-19", "2026-10-26"])
    assert.throws(() => dates(commitment, "2026-10-19Z", "2026-11-09Z", 2), projectionError("occurrence_limit_exceeded"))
    // Natural horizon/end-date bounds apply before the configured row cap.
    assert.deepEqual(dates({ ...commitment, endDate: new Date("2026-10-26Z") },
      "2026-10-19Z", "2027-01-01Z", 2), ["2026-10-19", "2026-10-26"])
    assert.equal(dates(commitment, "2026-10-19Z", "2031-08-04Z").length, 250)
    assert.throws(() => dates(commitment, "2026-10-19Z", "2031-08-11Z"), projectionError("occurrence_limit_exceeded"))
    // Preserve the existing ability to explicitly request more than the default 250.
    assert.equal(dates(commitment, "2026-10-19Z", "2031-08-11Z", 251).length, 251)
    assert.throws(() => dates(commitment, "1900-01-01Z", "+200000-01-01T00:00:00Z"), projectionError("occurrence_limit_exceeded"))
  })

  test("rejects invalid dates, reversed boundaries and unsafe occurrence limits explicitly", () => {
    const invalid = new Date(NaN)
    const project = (overrides: Partial<Parameters<typeof projectCommitmentOccurrences>[0]>) => projectCommitmentOccurrences({
      commitment: buildCommitment({}), windowStart: new Date("2026-09-01Z"), windowEnd: new Date("2026-10-01Z"), ...overrides,
    })
    for (const field of ["windowStart", "windowEnd"] as const) {
      assert.throws(() => project({ [field]: invalid }), projectionError("invalid_date"))
    }
    for (const field of ["nextDueDate", "startDate", "endDate"] as const) {
      assert.throws(() => project({ commitment: buildCommitment({ [field]: invalid }) }), projectionError("invalid_date"))
    }
    assert.throws(() => project({ windowEnd: new Date("2026-08-31Z") }), projectionError("invalid_window"))
    assert.throws(() => project({ commitment: buildCommitment({ startDate: new Date("2026-09-02Z"), endDate: new Date("2026-09-01Z") }) }), projectionError("invalid_boundaries"))
    assert.throws(() => project({ commitment: { ...buildCommitment({}), nextDueDate: null } }), projectionError("missing_next_due_date"))
    for (const maxOccurrences of [NaN, Infinity, -Infinity, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => project({ maxOccurrences }), projectionError("invalid_occurrence_limit"))
    }
  })

  test("legacy custom recurrence fails closed rather than becoming one-off or a complete total", () => {
    const commitment = buildCommitment({ frequency: "custom", recurrenceRule: { interval: 2 } })
    assert.throws(() => dates(commitment, "2026-09-01Z", "2026-10-01Z"), projectionError("unsupported_recurrence"))
    // A past custom anchor does not prove that the unsupported schedule is over.
    assert.throws(() => dates(commitment, "2026-10-19Z", "2026-11-01Z"), projectionError("unsupported_recurrence"))
    assert.throws(() => buildCommitmentHorizonTotals({ commitments: [commitment], now: new Date("2026-09-01Z") }), projectionError("unsupported_recurrence"))
    assert.deepEqual(dates({ ...commitment, status: "paused" }, "2026-09-01Z", "2026-10-01Z"), [])
    assert.deepEqual(dates({ ...commitment, endDate: new Date("2026-08-31Z") }, "2026-09-01Z", "2026-10-01Z"), [])
    assert.deepEqual(dates({ ...commitment, startDate: new Date("2026-10-01Z") }, "2026-09-01Z", "2026-10-01Z"), [])
  })

  test("horizon totals preserve their shape and use exactly days UTC dates", () => {
    const totals = buildCommitmentHorizonTotals({
      commitments: [0, 6, 7].map((offset) => buildCommitment({
        id: `boundary-${offset}`, frequency: "one_off", amountCents: 100,
        nextDueDate: new Date(Date.UTC(2026, 9, 19 + offset)),
      })), now: new Date("2026-10-19T23:59:59Z"), horizons: [7],
    })
    assert.deepEqual(totals, [{ days: 7, totalCents: 200, confirmedCents: 200, probableCents: 0, potentialCents: 0 }])
    for (const days of [NaN, Infinity, -Infinity, -7, 0, 7.5, Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => buildCommitmentHorizonTotals({ commitments: [], horizons: [days as 7] }), projectionError("invalid_window"))
    }
    assert.throws(() => buildCommitmentHorizonTotals({ commitments: [], now: new Date(NaN) }), projectionError("invalid_date"))
  })

  test("aggregates horizons with confidence partitions", () => {
    const commitments = [
      buildCommitment({ id: "c1", amountCents: 10_000, confidence: "confirmed", frequency: "one_off" }),
      buildCommitment({ id: "c2", amountCents: 20_000, confidence: "high", frequency: "one_off" }),
      buildCommitment({ id: "c3", amountCents: 30_000, confidence: "low", frequency: "one_off" }),
    ]

    const horizons = buildCommitmentHorizonTotals({
      commitments,
      now: new Date("2026-09-01T00:00:00.000Z"),
      horizons: [7],
    })

    assert.equal(horizons.length, 1)
    assert.equal(horizons[0].totalCents, 60_000)
    assert.equal(horizons[0].confirmedCents, 10_000)
    assert.equal(horizons[0].probableCents, 20_000)
    assert.equal(horizons[0].potentialCents, 30_000)
  })

  test("partitions AUD/USD by source currency and labels every confidence without weighting", () => {
    const commitments = ["AUD", "usd"].flatMap((currency) =>
      (["confirmed", "high", "medium", "low"] as const).map((confidence, index) => buildCommitment({
        id: `${currency}-${confidence}`, currency, confidence, frequency: "one_off", amountCents: (index + 1) * 100,
      })))
    const groups = buildCommitmentHorizonsByCurrency({ commitments, now: new Date("2026-09-01Z"), horizons: [7] })
    assert.deepEqual(groups.map((group) => [group.currency, group.supportedForFreeCash, group.horizons]), [
      ["aud", true, [{ days: 7, totalCents: 1000, confirmedCents: 100, probableCents: 500, potentialCents: 400, occurrenceCount: 4 }]],
      ["usd", true, [{ days: 7, totalCents: 1000, confirmedCents: 100, probableCents: 500, potentialCents: 400, occurrenceCount: 4 }]],
    ])
    assert.throws(() => buildCommitmentHorizonTotals({ commitments, now: new Date("2026-09-01Z") }), projectionError("mixed_currencies"))
  })

  for (const [confidence, label] of [
    ["confirmed", "confirmed"], ["high", "probable"], ["medium", "probable"], ["low", "potential"],
  ] as const) {
    test(`${confidence} is labeled ${label} and fully included in conservative protection`, () => {
      const result = buildCommitmentProtection({
        commitments: [buildCommitment({ confidence, frequency: "one_off", amountCents: 500 })],
        now: new Date("2026-09-01Z"), selectedHorizonDays: 60, cashCurrency: "aud",
      })
      assert.deepEqual(result.includedConfidenceClasses, ["confirmed", "probable", "potential"])
      assert.equal(result.selectedCurrencyTotals?.[`${label}Cents`], 500)
      assert.equal(result.selectedCurrencyTotals?.totalCents, 500)
      assert.equal(result.unavailableReason, null)
    })
  }

  test("selected currency components remain visible with explicit exclusions, never consolidated free cash", () => {
    const commitments = [buildCommitment({ currency: "aud", frequency: "one_off", amountCents: 100 }),
      buildCommitment({ currency: "usd", frequency: "one_off", amountCents: 900 })]
    for (const [cashCurrency, total, excluded] of [["aud", 100, "usd"], ["USD", 900, "aud"]] as const) {
      const result = buildCommitmentProtection({ commitments, now: new Date("2026-09-01Z"), selectedHorizonDays: 30, cashCurrency })
      assert.equal(result.selectedCurrencyTotals?.totalCents, total)
      assert.equal(result.cashCurrency, cashCurrency.toLowerCase())
      assert.deepEqual(result.excludedCurrencies, [excluded])
      assert.equal(result.unavailableReason, "currency_mismatch")
      assert.equal(result.horizonsByCurrency.length, 2)
    }
  })

  test("day-45 protection uses 60 days while the monthly percentage basis remains 30 days", () => {
    const commitments = [buildCommitment({ frequency: "one_off", nextDueDate: new Date("2026-11-03Z"), amountCents: 500 })]
    for (const [selectedHorizonDays, expected] of [[30, 0], [60, 500]] as const) {
      const result = buildCommitmentProtection({ commitments, now: new Date("2026-09-19Z"), selectedHorizonDays, cashCurrency: "aud" })
      assert.equal(result.selectedCurrencyTotals?.totalCents, expected)
      assert.equal(result.monthlyCommitmentsCents, 0)
    }
  })

  test("each of the eight allowed currencies is usable; unsupported stored currencies stay visible", () => {
    for (const cashCurrency of ["aud", "usd", "nzd", "gbp", "eur", "cad", "sgd", "hkd"]) {
      const result = buildCommitmentProtection({
        commitments: [buildCommitment({ currency: cashCurrency, frequency: "one_off" })],
        now: new Date("2026-09-01Z"), selectedHorizonDays: 30, cashCurrency,
      })
      assert.equal(result.unavailableReason, null)
      assert.equal(result.selectedCurrencyTotals?.totalCents, 25_000)
    }
    const unsupported = buildCommitment({ currency: "jpy", frequency: "one_off" })
    const result = buildCommitmentProtection({ commitments: [unsupported], now: new Date("2026-09-01Z"), selectedHorizonDays: 30, cashCurrency: "jpy" })
    assert.equal(result.unavailableReason, "unsupported_currency")
    assert.equal(result.selectedCurrencyTotals, null)
    assert.equal(result.monthlyCommitmentsCents, null)
    assert.equal(result.horizonsByCurrency[0].supportedForFreeCash, false)
    assert.equal(result.horizonsByCurrency[0].horizons[1].totalCents, 25_000)
    assert.throws(() => buildCommitmentHorizonTotals({ commitments: [unsupported], now: new Date("2026-09-01Z") }), projectionError("unsupported_currency"))
  })

  test("missing cash currency cannot select the first group, and an empty selected group is explicit zero", () => {
    const commitments = [buildCommitment({ currency: "usd", frequency: "one_off" })]
    const result = buildCommitmentProtection({ commitments, now: new Date("2026-09-01Z"), selectedHorizonDays: 30, cashCurrency: null })
    assert.equal(result.unavailableReason, "cash_currency_missing")
    assert.equal(result.selectedCurrencyTotals, null)
    assert.equal(result.monthlyCommitmentsCents, null)
    assert.deepEqual(result.excludedCurrencies, ["usd"])
    const empty = buildCommitmentProtection({ commitments: [], now: new Date("2026-09-01Z"), selectedHorizonDays: 60, cashCurrency: "aud" })
    assert.equal(empty.selectedCurrencyTotals?.totalCents, 0)
    assert.equal(empty.unavailableReason, null)
  })

  test("only in-selected-horizon foreign occurrences exclude currency, including zero amounts", () => {
    const commitments = [buildCommitment({ frequency: "one_off", currency: "usd", amountCents: 0, nextDueDate: new Date("2026-10-16Z") })]
    for (const [selectedHorizonDays, excluded] of [[30, []], [60, ["usd"]]] as const) {
      const result = buildCommitmentProtection({ commitments, now: new Date("2026-09-01Z"), selectedHorizonDays, cashCurrency: "aud" })
      assert.deepEqual(result.excludedCurrencies, excluded)
      assert.equal(result.horizonsByCurrency[0].horizons[2].occurrenceCount, 1)
    }
  })

  test("legacy totals retain empty shape but never hide overflow or invalid cents", () => {
    assert.deepEqual(buildCommitmentHorizonTotals({ commitments: [], horizons: [7] }), [
      { days: 7, totalCents: 0, confirmedCents: 0, probableCents: 0, potentialCents: 0 },
    ])
    for (const amountCents of [-1, 0.1, NaN, Infinity]) {
      assert.throws(() => buildCommitmentHorizonsByCurrency({
        commitments: [buildCommitment({ amountCents, frequency: "one_off" })], now: new Date("2026-09-01Z"),
      }), projectionError("invalid_amount"))
    }
    assert.throws(() => buildCommitmentHorizonTotals({ commitments: [
      buildCommitment({ amountCents: 2_147_483_647, frequency: "one_off" }),
      buildCommitment({ amountCents: 1, frequency: "one_off" }),
    ], now: new Date("2026-09-01Z") }), projectionError("amount_overflow"))
  })

  test("large separate currency totals do not overflow an invented cross-currency sum", () => {
    const groups = buildCommitmentHorizonsByCurrency({ commitments: ["aud", "usd"].map((currency) =>
      buildCommitment({ currency, amountCents: 2_147_483_647, frequency: "one_off" })),
      now: new Date("2026-09-01Z"), horizons: [30] })
    assert.deepEqual(groups.map((group) => group.horizons[0].totalCents), [2_147_483_647, 2_147_483_647])
  })

  test("computes free-cash states deterministically", () => {
    const safe = calculateFreeCashBreakdown({
      cashAvailableCents: 500_000,
      committedCashCents: 100_000,
      taxProtectedCashCents: 100_000,
      safetyBufferCents: 50_000,
    })

    const watch = calculateFreeCashBreakdown({
      cashAvailableCents: 260_000,
      committedCashCents: 100_000,
      taxProtectedCashCents: 100_000,
      safetyBufferCents: 50_000,
    })

    const shortfall = calculateFreeCashBreakdown({
      cashAvailableCents: 220_000,
      committedCashCents: 100_000,
      taxProtectedCashCents: 100_000,
      safetyBufferCents: 50_000,
    })

    assert.equal(safe.status, "safe")
    assert.equal(watch.status, "at_risk")
    assert.equal(shortfall.status, "shortfall")
  })

  test("derives renewal severities from warning windows", () => {
    const severity = assessRenewalSeverity({
      renewalDate: new Date("2026-10-15T00:00:00.000Z"),
      noticePeriodDays: 30,
      now: new Date("2026-09-20T00:00:00.000Z"),
      warningDays: [30, 14, 7],
    })

    assert.equal(severity, "urgent")
  })

  test("builds sorted renewal assessments", () => {
    const renewals = buildRenewalAssessments({
      now: new Date("2026-09-01T00:00:00.000Z"),
      commitments: [
        buildCommitment({
          id: "late",
          name: "Later renewal",
          renewalDate: new Date("2026-12-01T00:00:00.000Z"),
          noticePeriodDays: 30,
        }),
        buildCommitment({
          id: "soon",
          name: "Soon renewal",
          renewalDate: new Date("2026-10-01T00:00:00.000Z"),
          noticePeriodDays: 15,
        }),
      ],
    })

    assert.equal(renewals.length, 2)
    assert.equal(renewals[0].commitmentId, "soon")
    assert.ok(renewals[0].noticeCloseDate <= renewals[1].noticeCloseDate)
  })

  test("resolves safety buffer strategies", () => {
    const fixedSettings: CommitGuardSettingsSnapshot = {
      enabled: true,
      defaultHorizonDays: 30,
      safetyBufferMode: "fixed_amount",
      safetyBufferFixedCents: 40_000,
      safetyBufferCurrency: "aud",
      safetyBufferPercent: null,
      safetyBufferWeeks: null,
      detectRecurringCommitments: true,
      detectionMinOccurrences: 3,
      detectionAmountVariancePercent: 12,
      detectionIntervalToleranceDays: 3,
      detectionConfidenceThreshold: "medium",
      alertCommitmentDueSoon: true,
      alertRenewalApproaching: true,
      alertNoticePeriodApproaching: true,
      alertCommitmentAmountChanged: true,
      alertCommitmentBufferLow: true,
      alertCommitmentShortfall: true,
      renewalWarningDays: [90, 60, 30, 14, 7],
    }

    const percentSettings: CommitGuardSettingsSnapshot = {
      ...fixedSettings,
      safetyBufferMode: "percentage_monthly_commitments",
      safetyBufferPercent: 20,
    }

    assert.equal(
      resolveSafetyBufferCents({
        settings: fixedSettings,
        cashCurrency: "aud",
        monthlyCommitmentsCents: 300_000,
        weeklyOperatingExpensesCents: 0,
      }),
      40_000,
    )

    assert.equal(
      resolveSafetyBufferCents({
        settings: percentSettings,
        cashCurrency: "aud",
        monthlyCommitmentsCents: 300_000,
        weeklyOperatingExpensesCents: 0,
      }),
      60_000,
    )
  })
})
