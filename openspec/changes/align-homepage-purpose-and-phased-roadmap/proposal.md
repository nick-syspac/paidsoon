## Why

The current homepage message is still primarily "automated invoice follow-ups". The About page already defines the broader product purpose: PaidSoon as a financial control platform that turns accounting records into practical actions.

This creates a positioning mismatch across public pages:

- About says PaidSoon helps control the future
- Homepage mostly says PaidSoon helps chase overdue invoices
- Roadmap lists planned items but not in a clear phased now/future progression

To improve clarity for prospects and partners, the homepage and roadmap should consistently present PaidSoon as the action layer above accounting systems, with a transparent phased roadmap.

## What Changes

- **MODIFIED** homepage messaging on `/` to align with About page purpose:
  - include the core framing that accounting software records what happened, while PaidSoon guides what to do next
  - include a clear Xero/MYOB comparison statement and practical outcome bullets
- **MODIFIED** homepage content structure to add a dedicated product-purpose section:
  - "Xero and MYOB tell you what happened. PaidSoon tells you..."
  - seven user-outcome bullets:
    - What needs attention today
    - What will happen next month
    - What action you should take
    - How to improve cashflow
    - Where you're losing money
    - Which customers are becoming risky
    - Whether you'll have enough cash for wages, tax, and suppliers
- **MODIFIED** roadmap presentation on `/roadmap` to include explicit phased delivery sections:
  - **Phase 1**: Promise to pay, Disputes, Customer payment scoring
  - **Phase 2**: Spendleak, Cash forecasting, AI owner digest, Subscription detection
  - **Phase 3**: Benchmark against similar businesses, Predict insolvency risk, Automatic payment plans, AI cashflow coach
  - **Phase 4**: Industry benchmarking, Bank integrations, Lending readiness score, Working capital optimisation
- **MODIFIED** homepage "now/future" preview to mirror the same phased model at a summary level and link to `/roadmap`
- **MODIFIED** metadata/copy where needed so SEO descriptions no longer describe PaidSoon only as overdue-invoice automation

## Capabilities

### Modified Capabilities

- `marketing-homepage`: Reposition homepage from a single-problem collection tool to a broader financial control narrative aligned with About page intent.
- `marketing-roadmap`: Restructure roadmap into explicit phased now/future progression with the requested implementation items.
- `marketing-messaging-consistency`: Align value proposition language across `/`, `/about`, and `/roadmap` to remove conflicting product framing.

### New Capabilities

- `marketing-purpose-translation`: A dedicated homepage section that translates accounting-system history into forward-looking business actions.
- `marketing-phased-delivery-visibility`: A clear Phase 1-4 roadmap model that communicates sequencing of core and future capabilities.

## Impact

- **Modified files expected**:
  - `app/(marketing)/page.tsx`
  - `app/(marketing)/roadmap/page.tsx`
  - optional supporting shared copy/constants if extracted during implementation
- **No API changes**
- **No schema changes**
- **No billing/auth/RLS changes**
- **No environment variable changes**

The change is copy and marketing-structure focused, but influences product positioning and user expectation setting.
