## Context

The invoice-import capability currently only handles column mapping and basic parsing. Imported invoices need to integrate seamlessly into the existing tracked-invoice lifecycle so they trigger reminders, support payment links, and remain subject to the same tenant isolation rules as Stripe-connected invoices. The payment-link requirement extends an existing capability (reminder emails with payment URLs) to imported invoices, currently only supported for Stripe sources.

## Goals / Non-Goals

**Goals:**
- Enable CSV/XLSX invoice import as a first-class invoice source (alongside Stripe)
- Imported invoices behave identically to Stripe-connected invoices in reminder workflows
- Imported invoice payment links (if provided) render in reminder emails
- All import operations are tenant-scoped and auditable
- Validation errors are actionable and allow users to fix and retry
- Temporary import data is cleaned up while audit trail persists

**Non-Goals:**
- Real-time accounting sync (live data flow)
- Batch updates or bulk edits after import (one-time upload model)
- Multi-file import merging or conflict resolution
- Custom finding generation from imported invoices

## Decisions

**1. Import Batch Lifecycle Model**
- **Decision**: Import batches progress through states: `pending` → `mapping` → `validated` → `committed` or `failed`
- **Rationale**: Provides a clear, auditable progression and prevents accidental mutation of data during review
- **Alternative Considered**: Immediate commit with rollback on error (rejected: non-recoverable if validation reveals issues user cannot fix without re-uploading)

**2. Server-Side Validation Before Commit**
- **Decision**: All row-level validation occurs server-side; client receives blocking errors and non-blocking warnings
- **Rationale**: Prevents invalid data from ever entering the database; consistent validation rules across upload origins
- **Alternative Considered**: Client-side preview validation (rejected: no guarantee of consistency if client-side logic diverges)

**3. Tenant Isolation via RLS**
- **Decision**: All import batch queries use `withUserContext(userId, async (tx) => { ... })` to enforce RLS at database level
- **Rationale**: Same isolation model as tracked invoices; no special-casing for imports
- **Alternative Considered**: Application-level tenant checks (rejected: weaker guarantees, potential for bypass)

**4. Payment URL Preservation**
- **Decision**: `paymentUrl` is an optional column in the import template; if provided, the value is stored in `TrackedInvoice.paymentUrl` and rendered in reminder emails
- **Rationale**: Aligns with the payment-link requirement; leverages existing template token `{{ invoice.paymentUrl }}`
- **Alternative Considered**: Separate `importedPaymentUrl` column (rejected: overcomplicates template logic)

**5. Temporary Data Cleanup**
- **Decision**: Upload files and staging rows are deleted immediately after batch completion/failure; import metadata (batch record, validation errors) retained per audit policy
- **Rationale**: Minimizes PII retention; keeps audit trail for compliance and support
- **Alternative Considered**: Keep staging rows indefinitely (rejected: unnecessary data retention risk)

**6. Idempotency via File Hash**
- **Decision**: Import batches are deduplicated by hash of uploaded file + user + tenant; retries of the same file are skipped or merged based on prior state
- **Rationale**: Prevents duplicates if user re-uploads the same file; supports reliable retry behavior
- **Alternative Considered**: Database-level uniqueness on (user, timestamp) (rejected: doesn't handle accidental double-upload from same user)

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| **Large file uploads (>100MB)** | Enforce file size limits at upload endpoint; document supported limits in UI |
| **Payment URL misconfiguration** | Validation warns if URL is invalid or unreachable; does not block commit (user can correct post-import) |
| **Imported data drift if manual changes later conflict** | Imported invoices are tracked invoices; same reconciliation flow as Stripe sources; no special handling needed |
| **Batch cleanup race conditions** | Use database transaction boundaries; cleanup is idempotent and safe to retry |
| **Tenant data leakage via error messages** | Sanitize error reports; exclude actual row values in user-facing messages |

## Migration Plan

1. **Schema**: Add `ImportBatch` and `ImportStagingRow` tables; add nullable `paymentUrl` column to `TrackedInvoice` if not present
2. **Endpoints**: Deploy import API routes (`/api/invoices/import/upload`, `/upload/map`, `/upload/validate`, `/upload/commit`)
3. **Frontend**: Add import UI to Invoices tab (file picker, mapping, preview, commit)
4. **Email**: Ensure reminder templates render `{{ invoice.paymentUrl }}` for all sources
5. **Tests**: Add integration tests for import-to-reminder workflow; verify tenant isolation
6. **Rollback**: Disable import endpoints; keep schema in place (non-destructive migration)

## Open Questions

None—all design decisions are constrained by existing capabilities and can proceed to tasks.
