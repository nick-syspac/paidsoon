## Why

Dashboard and email summaries currently collapse invoice amounts across currencies and label the result with whichever currency appears first. That produces misleading totals and debtor rankings for tenants that import invoices in more than one currency.

## What Changes

- Make aggregated debt summaries currency-aware instead of flattening them into one total.
- Render dashboard totals, ageing/cash-waiting summaries, AI summary copy, and biggest-debtor rankings per currency bucket.
- Render the weekly debtor summary email per currency bucket so no debtor total is silently merged across currencies.
- Preserve current single-currency output when a tenant only has one currency in scope.
- **BREAKING**: any downstream consumer that assumes one displayed debt total per tenant must now handle multiple currency sections.

## Capabilities

### New Capabilities
- `currency-aware-debt-summaries`: dashboard and email debt summaries must keep amounts and debtor rankings separated by currency whenever mixed-currency invoices are present.

### Modified Capabilities
- (none)

## Impact

- Affects `lib/dashboard/ageing.ts`, `lib/dashboard/biggestDebtors.ts`, `lib/dashboard/aiSummary.ts`, `lib/dashboard/topKpiCards.ts`, `lib/email/weeklyDebtorSummary.ts`, and the dashboard/email components that render those summaries.
- Adds coverage for mixed-currency invoice sets in the dashboard and weekly debtor summary tests.
- No schema, RLS, or billing changes.