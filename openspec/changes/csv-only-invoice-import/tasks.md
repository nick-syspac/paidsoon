## 1. UI and API contract

- [x] 1.1 Update the invoice import screen copy so it states CSV only and remove the Excel template download affordance.
- [x] 1.2 Make the upload UI reject `.xlsx` selections with the same launch-safe message shown by the server.
- [x] 1.3 Keep the CSV template download and the rest of the import flow unchanged.

## 2. Import parsing and validation

- [x] 2.1 Restrict the invoice-import upload route to accept CSV uploads only and return a clear validation error for XLSX files.
- [x] 2.2 Simplify the invoice-import parser so it only accepts CSV input and no longer depends on Excel-specific parsing logic.
- [x] 2.3 Preserve existing CSV safety checks, including size limits, empty-file rejection, and data validation.

## 3. Tests and documentation

- [x] 3.1 Update invoice-import parser tests to expect CSV-only behavior and explicit XLSX rejection.
- [x] 3.2 Add or update route-level coverage for the upload path so a direct XLSX upload is rejected.
- [x] 3.3 Update any user-facing docs, runbooks, or help text that still advertise Excel import support.
- [x] 3.4 Run the focused import and onboarding checks, then the full lint, test, and build validation once the change is in place.
