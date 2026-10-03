# Spec Delta

## Purpose

Provides tenant-scoped analytical spending categories and explainable classifications for imported spend, including human review of uncertain model suggestions. These classifications support PaidSoon FinOps analysis and do not replace provider accounting records.

## ADDED Requirements

### Requirement: Tenant manages stable spending categories
The system SHALL provision the following default categories idempotently for each tenant on first use: `Software & Cloud`, `Professional Services`, `Payroll & Contractors`, `Marketing & Sales`, `Office & Supplies`, `Travel & Transport`, `Facilities & Equipment`, `Banking & Insurance`, `Taxes & Government`, and the reserved system category `Other`. Defaults other than `Other` remain tenant-editable. The system SHALL let a tenant add and rename spending categories, enforce tenant-wide uniqueness using names normalized with Unicode NFKC, trimmed/collapsed whitespace, and case-insensitive comparison, and preserve category identity and historical assignments when a category is renamed, retired, or merged.

The active category set, including `Other`, SHALL contain no more than 255 categories. Attempts to add an active category beyond that limit or use a normalized name already held by another category SHALL be rejected without partial changes. Retired and merged categories remain historical records and do not count toward the active limit. The reserved `Other` category SHALL remain active and cannot be renamed, retired, or merged. A merge targets a different active category; the source becomes merged and retains its identity and assignments for historical reporting.

#### Scenario: Tenant's defaults are provisioned once under concurrent first use
- **WHEN** concurrent requests provision defaults for the same tenant
- **THEN** each of the specified default categories, including exactly one reserved `Other`, exists once and other tenants' categories remain isolated

#### Scenario: Tenant adds a category at the active-option limit
- **WHEN** the tenant already has 255 active categories including `Other`
- **THEN** creation is rejected and no category is added

#### Scenario: Names collide after normalization
- **WHEN** a tenant adds or renames a category to a name that differs only by case or normalized whitespace/Unicode from another category name
- **THEN** the operation is rejected and existing categories remain unchanged

#### Scenario: Tenant renames a category
- **WHEN** a tenant renames an existing category
- **THEN** the category retains its stable identity, existing transaction assignments remain linked to it, and the change is auditable

#### Scenario: Tenant retires a category
- **WHEN** a tenant retires a category
- **THEN** it is excluded from new classification choices but remains available for historical assignments and reports

#### Scenario: Tenant merges categories
- **WHEN** a tenant merges one category into another
- **THEN** the source category remains as a historical record linked to the target, and reports can preserve the original assignment or roll it up to the target

#### Scenario: Tenant attempts to remove a reserved fallback
- **WHEN** a tenant attempts to delete or retire the system `Other` fallback
- **THEN** the system rejects the operation and preserves the fallback for classification and review

#### Scenario: Tenant attempts to rename or merge the reserved fallback
- **WHEN** a tenant attempts to rename or merge the system `Other` fallback
- **THEN** the system rejects the operation and preserves its reserved identity and label

### Requirement: Classification is separate from source accounting data
The system SHALL store PaidSoon's analytical category and review metadata separately from imported account, tax, contact, amount, and original transaction data.

#### Scenario: Classification updates an imported record
- **WHEN** a category is assigned to an imported bill or bank transaction
- **THEN** the system records a separate analytical assignment and leaves the imported provider fields and raw source data unchanged

#### Scenario: Imported records remain read-only to accounting providers
- **WHEN** a user reviews or changes a PaidSoon classification
- **THEN** the system does not write the classification or correction to Xero, MYOB, or another source provider

### Requirement: Deterministic classifications precede model suggestions
The system SHALL resolve applicable manual corrections, explicit source-account mappings, and tenant rules explicitly enabled by the tenant before requesting a Jev suggestion.

Represent source-account mappings as `SpendClassificationRule` rows with `ruleType: source_account`; `SpendClassification.ruleId` records the exact mapping/rule row used. A mapping is scoped to the tenant's `AccountingConnection` and matches only verified `expenseAccountCode` or `expenseAccountName` fields, never the cash/bank account fields. Prefer an exact trimmed, case-insensitive account-code match. A normalized account-name match is allowed only when the imported record has no expense account code. Duplicate enabled mapping identities for a connection and account key SHALL be rejected.

Tenant rules SHALL be stored in the same table with `ruleType: merchant` or `text_match`. Merchant rules match an exact normalized merchant name. Text rules match a literal normalized phrase in the transaction description. Rank source-account mappings ahead of tenant rules; within tenant rules rank exact merchant matches above text matches, then longer matching text phrases above shorter ones, then higher `priority`. If top-ranked matches point to different categories at the same specificity and priority, the outcome SHALL be `Needs review`; if they agree on a category, choose a rule deterministically by stable rule ID for traceability. Rule creation from a correction SHALL require an explicit user choice and explicit match criteria and SHALL apply only to source records first imported after the rule is created. Existing imported records SHALL remain unaffected by that rule, including on later re-imports.

#### Scenario: Manual correction takes precedence
- **WHEN** a transaction has a user-confirmed manual category and an automatic mapping or rule also matches
- **THEN** the system preserves the manual category unless the user explicitly changes or clears it

#### Scenario: Deterministic source or tenant rule matches
- **WHEN** an eligible source-account mapping or enabled tenant rule uniquely matches a transaction that has no manual correction
- **THEN** the system applies the matching category with its origin and the exact mapping or rule recorded

#### Scenario: Rules conflict or evidence is insufficient
- **WHEN** multiple applicable rules conflict or source fields do not identify a unique category
- **THEN** the system does not silently choose among the conflicting classifications and marks the record for review or Jev suggestion

#### Scenario: A source-account code mapping applies only to its connection
- **WHEN** a verified expense account code matches a mapping for the imported record's accounting connection
- **THEN** the mapping applies before tenant merchant/text rules and does not apply to the same code on another connection

#### Scenario: Source-account information is only a cash/bank account
- **WHEN** an imported bank transaction has a cash/bank account code but no verified expense-account coding
- **THEN** no source-account mapping matches and the transaction proceeds to tenant rules or review

#### Scenario: Equal-rank rules select conflicting categories
- **WHEN** applicable tenant rules match at the same specificity and priority but target different categories
- **THEN** the classification is marked `Needs review` rather than selecting a category arbitrarily

#### Scenario: A correction creates a future rule only by explicit choice
- **WHEN** a user corrects a classification and explicitly requests a rule with selected match criteria
- **THEN** the tenant-scoped rule is created for matching records first imported after rule creation, and existing records are not silently rewritten, including when later re-imported

### Requirement: Jev suggestions use bounded tenant categories and remain non-authoritative
For an opted-in tenant, the system SHALL request a category suggestion only from the active tenant category set plus `Other`, validate the response against that set, and retain the suggestion as unconfirmed until a user confirms it.

#### Scenario: Jev returns a valid candidate
- **WHEN** Jev returns an active tenant category or `Other` for an unresolved record
- **THEN** the system stores it as a suggestion with returned confidence and available probabilities, and displays it as unconfirmed

#### Scenario: Jev returns an invalid candidate or a low-confidence result
- **WHEN** the response does not match the candidate set or is below the configured review threshold
- **THEN** the system rejects the invalid candidate or marks the record `Needs review` without treating the result as confirmed

#### Scenario: Tenant has not opted in or Jev is unavailable
- **WHEN** a tenant has not opted in to external classification or the provider request fails
- **THEN** the system does not send transaction content to Jev and leaves unresolved records pending or in `Needs review` without failing the accounting import

### Requirement: External classification minimizes tenant data
The system SHALL send transaction context to TypeSafe only for opted-in tenants and only when necessary to classify an unresolved record.

#### Scenario: Unresolved opted-in transaction is sent for classification
- **WHEN** an opted-in tenant has an unresolved imported transaction
- **THEN** the request excludes source record identifiers, contact names and email addresses, references, and raw provider payloads, and uses only the approved minimized classification context

#### Scenario: Classification is explained to the user
- **WHEN** the system displays a classification
- **THEN** it identifies the actual source mapping or rule when one was applied, or labels Jev output as a suggestion and displays confidence without inventing a model rationale

### Requirement: User corrections are scoped and auditable
The system SHALL let a user confirm or correct an individual classification and explicitly choose whether to create a tenant-scoped rule for future matching records.

#### Scenario: User corrects one transaction
- **WHEN** a user changes a suggested or confirmed category for one transaction
- **THEN** the system records the actor, timestamp, prior and new category, and correction reason where supplied, without changing unrelated transactions

#### Scenario: User creates a future rule from a correction
- **WHEN** a user explicitly chooses to create a rule from a correction
- **THEN** the system creates a tenant-scoped rule for the selected match criteria and does not silently rewrite historical transactions

#### Scenario: User bulk-confirms selected suggestions
- **WHEN** a user explicitly selects multiple transactions and confirms the same category for that selection
- **THEN** the system applies and audits the action for each selected transaction and does not create a future rule unless separately requested

### Requirement: Classification is idempotent and preserves history
The system SHALL keep one current classification assignment per tenant and imported source record and SHALL preserve classification changes as an audit history.

#### Scenario: Imported source record is reprocessed unchanged
- **WHEN** the same provider source record is imported again without a classification-relevant change
- **THEN** the system does not create another assignment, repeat a completed Jev request, or overwrite a user-confirmed correction

#### Scenario: Source fields relevant to an automatic classification change
- **WHEN** a re-import changes fields used by a rule or model suggestion
- **THEN** the system reevaluates eligible automatic classifications while preserving manual corrections and recording the resulting classification event

#### Scenario: Category lifecycle changes after assignment
- **WHEN** a category is renamed, retired, or merged after transactions have been assigned
- **THEN** the system retains the assignment history and makes the lifecycle change traceable in historical views

### Requirement: Special transaction cases do not become unsupported spend guesses
The system SHALL distinguish identified non-spend transfers from spending categories and SHALL leave ambiguous refunds, split transactions, and other unsupported cases reviewable. A user SHALL be able to explicitly mark a transfer as excluded through an audited review action. A user may explicitly link an imported bank inflow refund to one confirmed, categorized outflow of the same tenant and currency; amount signs or descriptions alone SHALL NOT establish that link. Same-source-type linked refunds reduce the original category's source subtotal, while a refund linked across source types is shown as a separate credit under the refund's source type and does not change the original source-type subtotal. A refund without a valid explicit link remains reviewable.

#### Scenario: Transfer is identified
- **WHEN** deterministic source evidence or a user correction identifies an imported transaction as an internal transfer
- **THEN** the transaction is excluded from spending-category totals without deleting or changing its imported source record

#### Scenario: User marks an internal transfer
- **WHEN** a user explicitly marks an imported transaction as an internal transfer
- **THEN** the classification is stored as manually excluded with no spending category, an audit event is written, and later re-imports preserve the exclusion

#### Scenario: Refund cannot be linked to original spend
- **WHEN** an imported credit is identified as a refund but cannot be reliably linked to its original expense
- **THEN** the system marks it for review rather than categorizing it as ordinary positive spend

#### Scenario: User links a refund to same-source spend
- **WHEN** a user explicitly links an imported bank inflow to a confirmed outflow in the same currency and source type
- **THEN** the linked credit reduces that original category's subtotal for the shared source type and remains traceable to both imported records

#### Scenario: User links a refund across source types
- **WHEN** a user explicitly links an imported bank inflow to a confirmed bill outflow in the same currency
- **THEN** the credit is displayed separately under bank transactions with a link to the original bill and does not reduce the bills subtotal

#### Scenario: Refund link is invalid
- **WHEN** a refund is linked to a different tenant, a non-outflow, an unconfirmed or excluded record, a different currency, or a link that would credit more than the original outflow
- **THEN** the link is rejected and the refund remains reviewable

#### Scenario: Split transaction lacks normalized line detail
- **WHEN** an imported record represents a split transaction but PaidSoon has no normalized line-level amounts and categories
- **THEN** the system does not fabricate allocations and marks the transaction for review

#### Scenario: Payroll or tax payment is ambiguous
- **WHEN** the available source fields do not distinguish payroll or tax payments from other spending
- **THEN** the system does not infer a tax or bookkeeping treatment and leaves the record reviewable