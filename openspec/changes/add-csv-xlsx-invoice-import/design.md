## Context

See proposal.md - Why. This design adds a manual-import path alongside the existing Stripe Connect and direct-entry invoice flows. It must fit the current PaidSoon architecture: Next.js App Router, Prisma + Supabase Postgres, strict tenant isolation with `withUserContext`, and reminder safety that prevents any email dispatch unless a user later opts in through existing review actions.

## Goals / Non-Goals

**Goals:**
- Allow tenants to upload supported CSV/XLSX invoice files and map them to the canonical PaidSoon invoice schema
- Validate every row server-side before a batch is committed, with preview and blocking-error handling
- Preserve tenant boundaries, duplicate-safe matching, and reminder safety during batch import
- Provide versioned templates and imported-batch audit metadata with short-lived staging data

**Non-Goals:**
- Importing line items, products, tax returns, bank transactions, or attachment metadata
- Treating spreadsheet imports as a live accounting sync or auto-refreshing connection
- Supporting legacy spreadsheet formats or executing formulas during import processing

## Decisions

- Server-first validation model: the browser may suggest mappings and preview data, but the final validation and duplicate checks occur on the server. This protects against malformed files and prevents client-side bypasses.
- Versioned canonical schema: templates and importer logic share the same exported field list and version metadata so template headings cannot silently drift from the supported schema.
- Batch-oriented processing: uploads create an `InvoiceImportBatch` record first, then mapping + validation stages operate on tenant-scoped staging rows. This allows a reviewable, cancellable workflow without partial invoice creation.
- Safe storage lifecycle: raw uploads and staging data are stored in private tenant-scoped temporary storage and deleted immediately after processing or by 24 hours at the latest. Application records keep audit metadata and summary results only.
- Explicit reminder pause: imported invoices are created in a paused state and no reminder jobs may be enqueued from the import path. Existing reminder review flows remain the only activation route.
- Duplicate safety by default: skip-existing is the default mode, and only eligible invoices can be updated. This preserves reminder history, promises-to-pay, disputes, and user notes.

## Risks / Trade-offs

- [Ambiguous dates] → Require a user-selected format and show representative examples before validation proceeds.
- [Formula or malicious spreadsheet content] → Reject macros, external links, encrypted workbooks, unsupported cell types, and formula cells unless a tested literal-value policy is available.
- [False-positive duplicate detection] → Use explicit matching precedence (`customer_external_id` → `customer_email` → create new; `invoice_external_id` → `invoice_number`) and conflict errors when identifiers disagree across sources.
- [Operational growth in imported data] → Keep batch limits low, validate in stages, and enforce atomic commit so large or malformed files fail without partial writes.
- [Retention of sensitive data] → Store only metadata plus sanitised import errors, delete raw files and staging rows promptly, and log batch IDs and error codes rather than raw spreadsheet contents.

## Migration Plan

1. Extend the Prisma schema with the invoice-import entities, tenant-scoped constraints, and metadata fields needed for batches, mappings, staging rows, and error summaries.
2. Add the parsing and validation layer behind the same server-side boundaries used for invoice creation, ensuring all reads and writes pass through tenant-scoped user context and RLS-safe patterns.
3. Expose the upload, mapping, validation, status, errors, and template endpoints with permission checks and feature-flag gating.
4. Add the import review UI and template download actions in the invoice/debtors area; keep the import flow clearly labelled as manual spreadsheet data.
5. Run validation and batch commit in a single transactional unit, then enable a small pilot group before broader rollout.
6. Monitor import success/failure, cleanup events, and reminder-safety metrics before moving to general availability.

## Open Questions

None at this stage. The design resolves the primary technical decisions required to keep the feature safe, tenant-scoped, and compatible with the current PaidSoon architecture.
