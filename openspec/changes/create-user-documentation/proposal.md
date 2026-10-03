# Proposal

## Why

PaidSoon has many settings and financial-management modules, but the repository’s `docs/user` directory has no guide explaining how to set them up or use them. A verified, task-oriented manual will help customers configure their account and understand what each module can and cannot currently do.

## What Changes

- Add an index and a setup walkthrough under `docs/user/`, followed by focused guides for General settings, InvoiceGuard, DepositGuard, SpendLeak, Owner’s Digest, CommitGuard, Cost Guard, MarginGuard, RunwayGuard, Tax Buffer, and CashPlan.
- Use the current product labels and routes; cover setup prerequisites, key controls, common workflows, plan or entitlement limits, and troubleshooting where relevant.
- Distinguish available behavior from planned, gated, read-only, or otherwise limited behavior. In particular, do not imply that CashPlan settings are editable, that every Cost Guard or RunwayGuard figure reflects live account data, or that Owner’s Digest delivery time is local time.
- Keep these Markdown guides in `docs/user`; do not add them to the separate in-app Help Centre (`content/help`) or change application behavior.
- Correct obvious request typos in documentation headings and use the UI labels “Import / Export,” “SpendLeak,” “Owner’s Digest,” “Cost Guard,” “MarginGuard,” and “Tax Buffer.”

## Capabilities

### New Capabilities

None. This change adds documentation only.

### Modified Capabilities

None. No product behavior or acceptance contract changes.

## Impact

- Documentation: new user-guide Markdown files under `docs/user/`.
- No application code, routes, APIs, data model, dependencies, integrations, or migrations change.
- Documentation accuracy is the primary risk. Guides must be grounded in the current settings UI, feature catalog, and shipped workflows, and must not expose secrets or customer data.
- This is deliberately outside the in-app Help Centre content source; the new guides will not appear at `/help` unless a separate change integrates them.
