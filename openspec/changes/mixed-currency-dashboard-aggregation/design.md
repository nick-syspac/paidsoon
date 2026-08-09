## Context

See proposal.md - Why. The current dashboard and weekly debtor summary code assumes a single display currency and uses the first invoice currency as the label for summed amounts.

## Goals / Non-Goals

**Goals:**
- Keep all displayed money totals accurate when invoices span multiple currencies.
- Prevent debtor ranking from merging amounts that are not directly comparable.
- Preserve the current single-currency appearance when only one currency is present.

**Non-Goals:**
- No exchange-rate conversion or cross-currency normalization.
- No change to invoice import/storage currency fields.
- No new billing or accounting integration behavior.

## Decisions

- Partition summaries by normalized currency code before summing. This keeps each total in the currency it was invoiced in and avoids inventing a conversion policy.
- Group biggest-debtor rankings within each currency bucket rather than across the full invoice set. A debtor may appear more than once if they owe money in multiple currencies.
- Preserve the existing single-currency layout when only one bucket exists. This avoids a visual regression for the common case.
- Order currency buckets deterministically by currency code. That makes dashboard and email output stable and testable without introducing a new ranking rule.

## Risks / Trade-offs

- More vertical space in the dashboard and weekly email when a tenant uses several currencies -> keep sections compact and only render currencies with data.
- Some users may expect a single “total outstanding” figure -> present per-currency totals explicitly rather than implying a false cross-currency aggregate.
- Mixed-currency debtors may appear multiple times -> this is intentional because it is the only way to avoid merging incomparable values.
