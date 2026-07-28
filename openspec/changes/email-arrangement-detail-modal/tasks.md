## 1. Schema & Data Persistence

- [x] 1.1 Add `htmlBody String?` and `textBody String?` to `EmailLog` in `prisma/schema.prisma`
- [x] 1.2 Run `npx prisma migrate dev --name add_email_log_body` and verify `npx prisma generate` picks up the new fields
- [x] 1.3 Update `lib/email/send.ts` (`sendFollowUpEmail`) to persist the rendered `htmlBody`/`textBody` on the `EmailLog.create` call, for both the default template and custom `EmailTemplate` paths
- [x] 1.4 Confirm `prisma/rls-policies.sql` needs no change (new columns don't alter row visibility) and note this in a comment/commit message
- [x] 1.5 Run `npm run verify-rls` to confirm no regression

## 2. Arrangement Detail API Route

- [x] 2.1 Add `GET` handler to `app/api/arrangements/[id]/route.ts` (new file) that resolves the arrangement via `withUserContext(userId, ...)`, scoped by `id` + `userId`
- [x] 2.2 Include the arrangement's full `coverages` with each covered `TrackedInvoice`'s `clientName`, `clientEmail`, `amountDue`, `currency`, and `status` in the response
- [x] 2.3 Return 404 when the arrangement doesn't exist or doesn't belong to the requesting user (never leak existence to other users)
- [x] 2.4 Map the Prisma result to a safe response shape (no raw DB row passthrough, per `backend-api.instructions.md`)

## 3. Shared Detail Modal Component

- [x] 3.1 Create `components/dashboard/DetailModal.tsx`: overlay + panel, close button, closes on Escape key and backdrop click, accepts a `title` and children
- [x] 3.2 Ensure the modal is a `"use client"` component with no server-only imports

## 4. Email Content Modal

- [x] 4.1 Add a sanitizer for HTML email bodies (e.g. a small dependency-free allow-list sanitizer, or an existing lightweight sanitization utility) used before rendering `htmlBody` in the modal
- [x] 4.2 In `components/dashboard/InvoiceTable.tsx`, make each email history row clickable (`onClick`, `stopPropagation` from the row-expand handler) and track the selected `EmailLog` in state
- [x] 4.3 Render `DetailModal` with the email's subject, from-address, sent date, and sanitized body when an email history row is selected
- [x] 4.4 Show a "content not available for emails sent before this feature was added" fallback when `htmlBody`/`textBody` are both `null`
- [x] 4.5 Ensure `app/dashboard/page.tsx`'s invoice query still selects the new `EmailLog` fields (`include`/`select` may need updating since it's explicit)

## 5. Arrangement Detail Modal

- [x] 5.1 In `InvoiceTable.tsx`, make the arrangement summary cell clickable and track the selected arrangement id in state
- [x] 5.2 On open, fetch `GET /api/arrangements/[id]` and render a loading state while awaiting the response
- [x] 5.3 Render `DetailModal` with the arrangement's type, status, repayment terms, target date, terms/notes, and the full list of covered invoices
- [x] 5.4 Handle fetch errors (e.g. 404) with an inline error message inside the modal rather than a crash

## 6. Tests

- [x] 6.1 Add/extend a test covering `sendFollowUpEmail` persisting `htmlBody`/`textBody` on the created `EmailLog` (reimplement or exercise the relevant pure logic, consistent with existing test file conventions that avoid importing modules pulling in `prismaAdmin`)
- [x] 6.2 Add a route test for `GET /api/arrangements/[id]` covering: owner can fetch, non-owner gets 404, multi-invoice coverage is returned in full
- [x] 6.3 Run `npm run test` and confirm all tests pass

## 7. Documentation

- [x] 7.1 Update `docs/DDD.md` database model section with the new `EmailLog.htmlBody`/`textBody` columns
- [x] 7.2 Update `docs/DDD.md` API routes section with the new `GET /api/arrangements/[id]` route
