# Design: Move Account Health to Top of Dashboard

## Current Layout (`app/dashboard/page.tsx`)

```
<div className="space-y-6">
  <h1>Overview</h1>

  {currencySummaries.map(summary => (
    <CurrencySummarySection />          ← contains AiSummaryCard first
  ))}

  <AttentionRequired />

  <div className="grid …">
    <RecentPayments />
    <ReminderActivityFunnel />
  </div>

  <PaymentTrendChart />

  <div>                                 ← Account health — currently LAST
    <h2>Account health</h2>
    <OverviewCards cards={cards} />
  </div>
</div>
```

## Target Layout

```
<div className="space-y-6">
  <h1>Overview</h1>

  {currencySummaries.map(summary => (
    <CurrencySummarySection />          ← AiSummaryCard at top of each section
  ))}

  <div>                                 ← Account health — moved HERE (position 3)
    <h2>Account health</h2>
    <OverviewCards cards={cards} />
  </div>

  <AttentionRequired />

  <div className="grid …">
    <RecentPayments />
    <ReminderActivityFunnel />
  </div>

  <PaymentTrendChart />
</div>
```

## Why this position

`CurrencySummarySection` always renders `AiSummaryCard` as its first child. Placing Account health immediately after the currency summaries block means it appears visually right below the AI Summary in the single-currency case (the overwhelmingly common case). In the multi-currency case it appears below the last currency section, which is still near the top.

Account health cards are account-wide aggregates (not per-currency), so they belong at the page level rather than inside `CurrencySummarySection`.

## Changes Required

| File | Change |
|------|--------|
| `app/dashboard/page.tsx` | Cut the Account health `<div>` from its current position (bottom of JSX) and paste it immediately after the `{currencySummaries.map(…)}` block. |

No other files need to change.
