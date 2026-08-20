## 1. Schema

- [ ] 1.1 Add `disputeNote`, `disputeRaisedAt`, `disputeResolvedAt` nullable fields to `TrackedInvoice` and update the `status` field's comment to include `disputed`
- [ ] 1.2 Run `npx prisma migrate dev --name add-dispute-pause`

## 2. API routes

- [ ] 2.1 Add `POST /api/invoices/[id]/dispute`: validates an optional `note` with Zod, authenticates via `supabase.auth.getUser()`, uses `withUserContext`, sets `status = "disputed"`, `disputeNote`, `disputeRaisedAt = now()`
- [ ] 2.2 Add `POST /api/invoices/[id]/resolve-dispute`: uses `withUserContext`, sets `status = "pending"`, `disputeResolvedAt = now()`, clears `disputeNote`
- [ ] 2.3 Add tests for both routes covering tenant isolation (cannot dispute/resolve another tenant's invoice)

## 3. UI

- [ ] 3.1 Add a "Dispute" action button to `components/dashboard/InvoiceTable.tsx`
- [ ] 3.2 Add a "Disputed" badge visually distinct from the existing "Paused" badge
- [ ] 3.3 Add a resolve-dispute dialog capturing an optional resolution note

## 4. Docs and marketing accuracy

- [ ] 4.1 Update `docs/DDD.md` with the new status value and fields
- [ ] 4.2 Confirm `app/(marketing)/roadmap/page.tsx` "Dispute pause" claim is now accurate; if this change ships before other launch-blocking work, no copy change needed
