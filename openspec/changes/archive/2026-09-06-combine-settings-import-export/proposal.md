## Why

PaidSoon currently splits related data-management workflows across separate Settings tabs, which forces users to switch context between invoice import and invoice export. The export panel also repeats the standalone invoice-export heading inside the page, which makes the surface feel duplicated instead of unified. A single combined tab will reduce navigation friction and create room to surface expense import alongside invoice import and export in one place.

## What Changes

- Replace the separate Import and Invoice exports tabs with one combined Settings tab.
- Present invoice import, expense import, and invoice export as sections within one combined page.
- Keep the existing import and export workflows intact, including authentication and plan gating.
- Preserve direct-link compatibility by redirecting or aliasing the old import and export routes to the combined surface.
- Remove the redundant standalone invoice-export heading above the export workflow in favor of the combined page structure.

## Capabilities

### New Capabilities
- `settings-import-export`: combined Settings surface for invoice import, expense import, and invoice export from one tab, with the same authenticated and tenant-scoped access rules as the underlying workflows.

### Modified Capabilities
- None

## Impact

- Affects the Settings navigation in the dashboard shell.
- Affects the invoice import and invoice export settings routes and their page composition.
- Surfaces the existing expense import workflow through the Settings area.
- Requires route compatibility handling so existing deep links continue to work.