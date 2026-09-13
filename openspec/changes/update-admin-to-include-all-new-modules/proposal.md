## Why

The admin surface has drifted behind the product’s newer operational modules. We now have multiple feature areas—support, billing, activity, staffing, and module-specific health views—that need to be reachable and manageable from one admin entry point, but they are not yet represented consistently in the admin experience. Without a single admin surface that covers the full operating footprint, we cannot reliably triage issues, support customers, or maintain a clear view of what is active versus incomplete.

## What Changes

- **NEW**: Admin navigation and landing pages include the full set of product modules in a single, coherent operational surface
- **NEW**: Support workflows can be accessed and executed from the admin console without leaving the product context
- **NEW**: Admin issue triage includes the most important status, health, and escalation paths across the latest modules
- **MODIFIED**: Admin role and access logic treats the newest modules as first-class admin surfaces instead of orphaned or hidden features
- **MODIFIED**: The admin dashboard consolidates issue visibility and cross-module actions so operators can work through support problems end-to-end

## Capabilities

### New Capabilities
- `admin-module-surface`: The admin area includes the complete module set, with consistent navigation, access checks, and summary cards for the current operational modules.
- `admin-support-operations`: Support staff can reach customer-facing and module-level issue workflows from the admin console and work through operational issues without ad hoc navigation.

### Modified Capabilities
- `admin-issue-triage`: Requirements for customer and module issue triage are expanded to cover the latest modules and follow-up actions.

## Impact

- **UI**: The admin dashboard and related navigation expand to include new modules and updated status surfaces.
- **Access control**: Role checks and visibility logic are updated to reflect the complete set of supported modules.
- **Issue handling**: Support and admin workflows can cover more customer issues, account states, and module-specific problems without leaving the admin area.
- **Operations**: The admin team gains a single place to identify, review, and resolve new customer and platform issues across the product.
