# invoice-export Specification

## Purpose
The invoice-export capability lets an authorised, tenant-scoped PaidSoon user download their organisation's tracked-invoice data as CSV or XLSX, either as a quick export of the current dashboard invoice view or as an advanced, filterable export from a dedicated Settings screen.
## Requirements
### Requirement: CSV invoice export
The system SHALL generate a UTF-8 CSV file of the requesting user's tracked invoices, matching the documented export data dictionary, when the user requests a CSV export.

#### Scenario: Export all invoices as CSV
- **WHEN** an authorised user requests a CSV export with no filters applied
- **THEN** the system generates a UTF-8 CSV file containing one header row and one row per tracked invoice belonging to that user
- **AND** every column in the header matches the documented export data dictionary in name and order

#### Scenario: CSV quoting and escaping
- **WHEN** an exported field contains a comma, double quote, or line break
- **THEN** the system quotes and escapes the field per RFC 4180 so the file remains valid CSV when reopened

### Requirement: XLSX invoice export
The system SHALL generate a valid `.xlsx` workbook of the requesting user's tracked invoices, matching the documented export data dictionary, when the user requests an XLSX export.

#### Scenario: Export all invoices as XLSX
- **WHEN** an authorised user requests an XLSX export with no filters applied
- **THEN** the system generates a valid XLSX workbook with a worksheet named "Invoices" containing a header row followed by one row per tracked invoice belonging to that user
- **AND** date and numeric-amount columns are written as native spreadsheet date/number types rather than formatted text, and column filters (autofilter) are enabled over the header row
- **NOTE**: a frozen header row was originally in scope but is not achievable with the installed SheetJS Community Edition writer (verified against its source — pane-freeze state is never serialised regardless of what is set on the worksheet); this is a documented cosmetic gap, not an oversight.

### Requirement: Dashboard export respects the active invoice view
The system SHALL export only the invoices represented by the current dashboard invoice view, including its active status bucket and any applied overview-card filter, when the export is initiated from `/dashboard/invoices`.

#### Scenario: Export the currently filtered invoice view
- **WHEN** a user on `/dashboard/invoices` has an overview-card filter or resolved/active bucket applied and selects Export
- **THEN** the generated file contains only the invoices that satisfy that active filter, in either CSV or XLSX format as chosen
- **AND** the file download begins without requiring the user to leave the invoices screen

### Requirement: Settings advanced export screen
The system SHALL provide a "Invoice exports" screen under Settings that allows a user to choose CSV or XLSX, choose all invoices or a date range on a selected date field (invoice date, due date, or created date), and filter by status, customer, and accounting source where those fields exist on the invoice model.

#### Scenario: Export through the settings screen
- **WHEN** an authorised user on the Settings "Invoice exports" screen selects a format, an optional date range and date field, and optional status/customer/accounting-source filters, then confirms
- **THEN** the system generates and downloads a file containing only invoices matching every selected filter
- **AND** the screen indicates which date field (invoice date, due date, or created date) the selected range is being matched against

### Requirement: Export scope is independent of list pagination
The system SHALL include every invoice matching the active filters in an export, regardless of any pagination or page-size limit used to display invoices in the UI.

#### Scenario: Pagination does not truncate the export
- **WHEN** a filtered invoice view would span more than one UI page if paginated
- **THEN** the resulting export file contains every matching invoice, not only the invoices shown on the current or first page

### Requirement: Export tenant scoping and permission enforcement
The system SHALL restrict invoice export to the requesting user's own tenant data and SHALL require the same plan-based permission already used to gate the `csv_export` feature before generating any export.

#### Scenario: Unauthenticated or unauthorised export request is rejected
- **WHEN** a request to an export endpoint is made without a valid authenticated session, or by a user whose subscription tier does not include the `csv_export` feature
- **THEN** the system rejects the request without generating or returning any invoice data

#### Scenario: Cross-tenant data is not exposed
- **WHEN** a request supplies filter values (such as a customer id or invoice id) that belong to a different user's tenant
- **THEN** the export excludes those records and returns only the requesting user's own data, because tenant scoping is enforced server-side and is not derived from request-supplied filters alone

### Requirement: Duplicate export request prevention
The system SHALL prevent a second export request for the same control from being submitted while a prior export request from that control is still generating.

#### Scenario: Repeated export clicks while generating
- **WHEN** a user selects Export and the export is still being generated
- **THEN** the export control shows a generating/loading state and is disabled
- **AND** additional clicks during that time do not start a second, duplicate export request

### Requirement: Spreadsheet formula injection protection
The system SHALL sanitise every exported cell value that originates from user-controlled text so that values beginning with `=`, `+`, `-`, or `@` are not interpreted as spreadsheet formulas when the file is opened, without corrupting legitimate numeric or date values.

#### Scenario: User-controlled text resembling a formula is neutralised
- **WHEN** an exported text field (such as a customer name or note) begins with `=`, `+`, `-`, or `@`
- **THEN** the exported value is written so that spreadsheet applications display it as literal text rather than executing it as a formula

#### Scenario: Legitimate numeric and negative values are unaffected
- **WHEN** an exported amount, date, or other numeric-typed field has a value that begins with `-` (such as a negative or zero adjustment) or is a valid currency amount
- **THEN** the sanitisation applied to user-controlled text fields does not alter or corrupt that numeric or date value

### Requirement: Special character and Unicode handling
The system SHALL preserve Unicode characters, embedded quotes, commas, and multi-line text correctly in both CSV and XLSX exports.

#### Scenario: Unicode and special characters round-trip correctly
- **WHEN** an invoice or customer field contains non-ASCII Unicode characters, embedded double quotes, commas, or line breaks
- **THEN** the exported CSV and XLSX files preserve those characters and, when reopened in a standard spreadsheet application, display the original text without corruption or truncation

### Requirement: Descriptive export filenames
The system SHALL generate a descriptive, date-stamped filename for every export, reflecting the export format via its extension.

#### Scenario: Filename reflects date and format
- **WHEN** a user downloads a CSV or XLSX export
- **THEN** the downloaded filename follows the pattern `paidsoon-invoices-<YYYY-MM-DD>.csv` or `paidsoon-invoices-<YYYY-MM-DD>.xlsx`, using the date the export was generated

### Requirement: Empty export result handling
The system SHALL communicate clearly, without generating a broken or headers-only-with-no-explanation file experience, when no invoices match the requested export filters.

#### Scenario: No invoices match the export filters
- **WHEN** a user requests an export and no invoices match the applied filters
- **THEN** the Settings export screen shows an empty-state message explaining that no invoices matched instead of silently downloading an empty file
- **AND** the dashboard quick-export either downloads a valid header-only file or shows an equivalent empty-state message, consistently with the screen's existing empty-state pattern

### Requirement: Export failure handling
The system SHALL show a clear, user-facing error message and SHALL NOT leave the export control stuck in a loading state when export generation or download fails.

#### Scenario: Export generation fails
- **WHEN** export generation fails on the server (for example, a query error or an export exceeding the configured size ceiling)
- **THEN** the user sees an actionable error message without internal implementation details
- **AND** the export control returns to its normal, retryable state

### Requirement: Documented export data dictionary
The system SHALL export only fields defined in the documented export data dictionary, and any derived value (such as outstanding balance) SHALL be computed using the same logic already used elsewhere in the product.

#### Scenario: Exported columns match the data dictionary
- **WHEN** any export is generated in CSV or XLSX format
- **THEN** every column present in the file corresponds to an entry in the documented export data dictionary, with no undocumented, internal, secret, or access-token fields included

