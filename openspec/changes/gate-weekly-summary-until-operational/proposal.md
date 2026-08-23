## Why

The product currently advertises Weekly debtor summary email as available for paid tiers while the live production scheduling path does not trigger it automatically. This creates a paid promise gap for Small Business customers and can misrepresent feature availability at point of sale.

## What Changes

- Reclassify Weekly debtor summary email as non-operational until a verified production scheduler path exists.
- Treat the capability as coming soon in customer-facing plan and marketing surfaces while preserving current backend scaffolding.
- Require an explicit operational readiness gate before any customer-facing surface can restore an available/live claim for weekly summary.
- Align release-facing messaging so Weekly debtor summary is not listed as currently available while scheduler activation is pending.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `marketing-feature-claim-accuracy`: tighten requirements so features lacking an active production execution path are not claimed as available/live.
- `implementation-gated-entitlements`: treat entitled-but-operationally-inactive features as non-actionable and presented as coming soon until activation criteria are met.

## Impact

- Affected code and content:
  - Marketing pages under app/(marketing) that currently present weekly summary as available/live.
  - Plan catalog implementation-state signaling used by pricing and related plan messaging.
- Affected systems:
  - Marketing claim governance and entitlement presentation policy.
- No schema migration or new external dependency.
- Internal weekly summary route and worker code remain in place; this change only governs operational claim status until production scheduler activation is verified.
