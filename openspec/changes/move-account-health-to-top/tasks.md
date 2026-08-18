# Tasks: Move Account Health to Top of Dashboard

## [x] Task 1 — Reorder JSX in dashboard overview page

**File:** `app/dashboard/page.tsx`

**What to do:**

Move the Account health block from the bottom of the JSX return to immediately after the `{currencySummaries.map(...)}` block, before `<AttentionRequired>`.

**Before (current bottom of return):**
```tsx
      <PaymentTrendChart points={paymentTrend} />

      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-3">Account health</h2>
        <OverviewCards cards={cards} />
      </div>
    </div>
```

**After:**
```tsx
      <PaymentTrendChart points={paymentTrend} />
    </div>
```

And insert immediately after `{currencySummaries.map(...)}`:
```tsx
      <div>
        <h2 className="text-sm font-medium text-gray-600 mb-3">Account health</h2>
        <OverviewCards cards={cards} />
      </div>
```

**Acceptance criteria:**
- The Account health section renders directly below the last `CurrencySummarySection` (which ends with the AI Summary at the top of each section).
- All four cards (Overdue, Chase allowance, Broken promises, Held invoices) are visible without scrolling on a standard 1080p screen.
- No data-fetching logic changes.
- `npm run build` passes with no type errors.
- Visual regression: load `/dashboard` and confirm the card order matches the target layout in `design.md`.
