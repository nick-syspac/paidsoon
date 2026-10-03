## Purpose

The dashboard overview SHALL guide owners through the most urgent financial actions before broad operational context, so the page acts as a triage surface rather than a long list of module summaries.

## ADDED Requirements

### Requirement: Overview prioritises attention over background context
The overview SHALL render the highest-priority attention area first, followed by cash posture and then summary modules. The order SHALL reflect the user's likely decision-making sequence: invoice risk, cash position, digest, and then deeper module navigation.

#### Scenario: Owner opens the dashboard
- **WHEN** an authenticated user visits `/dashboard`
- **THEN** the system presents the most urgent invoice and collection issues before other summaries and module links

#### Scenario: Overview remains readable when many modules are enabled
- **WHEN** multiple dashboard modules are available to the user
- **THEN** the page groups the attention, cash, and digest sections into clear blocks rather than mixing them into a single flat stack

### Requirement: Attention block is the first section on overview
The overview SHALL include an attention block that surfaces the invoice conditions most likely to require action, including overdue, broken promises, disputed, and bounced signals, with clear visual severity.

#### Scenario: Owner has overdue invoices
- **WHEN** a user has overdue or unresolved invoice activity
- **THEN** the overview highlights those conditions in the attention block before other operational summaries

#### Scenario: No urgent invoices exist
- **WHEN** no invoice attention signals are active for the user
- **THEN** the attention block still renders a stable empty state that communicates the account is healthy and avoids a confusing blank area

### Requirement: Cash posture is the second section on overview
The overview SHALL include a cash-health section after attention, summarising the current CashPlan, RunwayGuard, and Tax Buffer posture in compact, decision-ready form.

#### Scenario: Owner checks immediate liquidity risk
- **WHEN** a user reviews the overview for cash risk
- **THEN** they can quickly see the cash plan status, runway signal, and tax reserve posture without navigating away from the page

#### Scenario: Cash posture is not available
- **WHEN** the user does not have the required plan access or data available
- **THEN** the system shows the appropriate unavailable or upgrade state without breaking the page layout

### Requirement: Digest section is distinct from operational alerts
The overview SHALL present digest and risk summaries as a distinct section after attention and cash posture, so strategic summaries are separated from immediate action signals.

#### Scenario: Owner wants a higher-level summary
- **WHEN** a user scans the overview after triaging invoices and cash health
- **THEN** the digest section provides a concise executive summary and links to deeper modules

#### Scenario: Alerts and digest are not confused
- **WHEN** the system displays both action items and summary modules
- **THEN** the page preserves a clear boundary between urgent operational decisions and contextual strategic summaries

### Requirement: Module navigation remains available but is secondary
The overview SHALL keep direct access to deeper modules available, but the links SHALL be presented after the attention, cash, and digest sections rather than dominating the initial page hierarchy.

#### Scenario: Owner clicks through to a deeper module
- **WHEN** the user wants to inspect a specific module after reviewing the overview
- **THEN** the system provides direct path links to the relevant module pages without requiring an additional navigation search

#### Scenario: Overview stays focused on decision-making
- **WHEN** the user is scanning the top of the dashboard
- **THEN** the first visible information is the status requiring action, not the full module catalogue
