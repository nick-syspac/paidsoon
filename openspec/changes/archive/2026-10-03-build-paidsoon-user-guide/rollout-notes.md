# Build PaidSoon User Guide - Rollout Notes

## Governance Decisions

- Canonical frontmatter owner field: `owner`
- Freshness policy: each help page must be revalidated within 60 days of `lastVerified`
- Current owner identifier for shipped guide pages: `help-content`

## User Guide Coverage Map

- Onboarding
  - `/help/import-outstanding-invoices`
  - `/help/configure-reminder-schedule`
- Billing and subscription
  - `/help/manage-subscription-and-billing`
- Invoice workflows
  - `/help/payment-links-in-reminder-emails`
  - `/help/pause-reminders`
  - `/help/record-a-promise-to-pay`
  - `/help/manually-resolve-an-invoice`
  - `/help/dashboard-collection-metrics`
  - `/help/export-invoices`
- Integrations
  - `/help/connect-stripe-invoices`
  - `/help/connect-xero`
  - `/help/connect-myob`
- Account and settings
  - `/help/update-account-profile`

## Accuracy Pass Summary

- Removed outdated MYOB early-access wording to match current integration status.
- Updated dispute guidance to reflect available `Dispute` and `Resolve dispute` bulk actions.
- Updated billing reference on help index to `Settings -> Subscription`.
- Updated export guide settings path to `/dashboard/settings/import-export`.

## Search and Navigation Verification

- Help navigation now groups pages by frontmatter metadata (`guideSection`, `guideOrder`) and surfaces all required sections.
- Search remains scoped to help content by using `helpSource` in `/api/help/search`.

## Next Operational Checkpoint

- By 2026-11-08, complete the next freshness review and update `lastVerified` on any changed pages.
