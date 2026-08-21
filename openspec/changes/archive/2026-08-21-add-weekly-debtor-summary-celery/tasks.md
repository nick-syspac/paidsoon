## 1. Summary Data and Email Content

- [x] 1.1 Define the weekly debtor summary payload in shared application code so it can be unit tested without Celery.
- [x] 1.2 Build the tenant-scoped summary query/aggregation for overdue invoices and debtor status.
- [x] 1.3 Add the email template/content builder for the weekly summary message.

## 2. Celery Delivery

- [x] 2.1 Add a Celery Beat schedule for the weekly debtor summary job.
- [x] 2.2 Implement the worker task that iterates tenants and sends exactly one summary per tenant.
- [x] 2.3 Add idempotency for the weekly send so a tenant cannot receive duplicates for the same week.

## 3. Product Surface Updates

- [x] 3.1 Mark `weekly_summary_email` as implemented in the plan catalog and update any feature-gating checks that surface it as "Coming soon".
- [x] 3.2 Update the pricing/help copy so the feature is shown as available where the catalog already enables it.
- [x] 3.3 Update documentation that still describes weekly debtor summary as unimplemented.

## 4. Validation

- [x] 4.1 Add tests for tenant scoping, summary contents, and duplicate-send prevention.
- [x] 4.2 Run the relevant test subset for the summary builder and plan-catalog changes.
- [x] 4.3 Verify the worker schedule and email path do not affect unrelated reminder or billing jobs.
