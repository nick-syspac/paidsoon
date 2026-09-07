## Why

PaidSoon’s invoice import flow currently advertises both CSV and Excel, but for launch safety we want a single, simpler ingestion path. Restricting import to CSV reduces user confusion, removes the risky spreadsheet parser surface, and keeps the import workflow easier to validate and support while the team hardens the rest of the release.

## What Changes

- **BREAKING**: invoice import will accept CSV only for the time being.
- Remove the Excel template download from the import screen.
- Update import screen copy so it clearly says CSV only.
- Reject `.xlsx` uploads at the API boundary with a user-facing validation error.
- Keep the CSV import workflow unchanged: template download, upload, column mapping, validation, staging, and commit still work.
- Leave invoice export unchanged.

## Capabilities

### Modified Capabilities
- `invoice-import`: change the template and upload requirements so the capability only supports CSV import for now, with Excel explicitly out of scope until a later change reintroduces it.

## Impact

Affected code and systems:
- Import UI on the dashboard settings page
- Invoice import upload and parsing routes
- Import template generation and file validation logic
- Import-related tests and user-facing copy
- Release readiness and support documentation that mentions spreadsheet import formats
