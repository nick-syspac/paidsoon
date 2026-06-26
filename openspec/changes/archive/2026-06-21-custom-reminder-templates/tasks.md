## 1. Dependencies

- [x] 1.1 Install `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`
- [x] 1.2 Install `sanitize-html` and `@types/sanitize-html`

## 2. Database

- [x] 2.1 Add `EmailTemplate` model to `prisma/schema.prisma` with fields: `id`, `userId`, `stage` (Int), `subject`, `htmlBody`, `textBody`, `createdAt`, `updatedAt`; relation to `UserProfile`; `@@unique([userId, stage])`
- [x] 2.2 Run `npx prisma migrate dev --name add-email-templates` to generate the migration
- [x] 2.3 Add RLS policies for `email_templates` to `prisma/rls-policies.sql`
- [ ] 2.4 Run `npm run verify-rls` to confirm RLS isolation

## 3. Interpolation Engine

- [x] 3.1 Add `ResolvedTemplateVars` type and `resolveVars(stage: 1|2|3, vars: TemplateVars): ResolvedTemplateVars` function in `lib/email/templates.ts` — handles `invoiceRef`, `paymentLink`, stage-scoped `daysOverdue`/`firmDeadline`
- [x] 3.2 Add `interpolate(template: string, vars: ResolvedTemplateVars): string` function — replaces `{{token}}` occurrences; unknown tokens are preserved
- [x] 3.3 Add static default template string constants: `DEFAULT_STAGE_1`, `DEFAULT_STAGE_2`, `DEFAULT_STAGE_3` — each with `subject`, `htmlBody`, `textBody` properties using `{{token}}` syntax
- [x] 3.4 Refactor `renderStage1`, `renderStage2`, `renderStage3` to call `interpolate(DEFAULT_STAGE_N.htmlBody, resolveVars(n, vars))` internally — preserving identical output
- [x] 3.5 Add unit tests in `tests/template-interpolation.test.ts`

## 4. API Routes

- [x] 4.1 Update `GET /api/settings/templates` to accept `?stage=1|2|3` query param; return saved custom template if exists, otherwise return `DEFAULT_STAGE_N` strings; include `canCustomize` and `tier`
- [x] 4.2 Update `PUT /api/settings/templates` to accept `stage`, `subject`, `htmlBody`, `textBody`; upsert `EmailTemplate` record via `withUserContext`; enforce `custom_reminder_templates` feature flag; validate with Zod (min/max lengths per design)
- [x] 4.3 Add `DELETE /api/settings/templates?stage=` route; delete the matching `EmailTemplate` record for the authenticated user; idempotent (200 if not found)

## 5. Send Path

- [x] 5.1 Update `lib/email/send.ts` to look up `EmailTemplate` for the user+stage before sending; use custom template if found, else use `DEFAULT_STAGE_N`
- [x] 5.2 Add `sanitizeHtml(html: string): string` helper in `lib/email/send.ts` using `sanitize-html` with the allowlist defined in design.md
- [x] 5.3 Apply `sanitizeHtml` to `htmlBody` (both custom and default paths) before passing to Resend

## 6. WYSIWYG Editor Component

- [x] 6.1 Create `components/settings/TemplateEditor.tsx` — TipTap editor with `StarterKit`, `Underline`, `Link`, and `Placeholder` extensions; toolbar with Bold, Italic, Underline, BulletList, OrderedList, Link buttons
- [x] 6.2 Add variable chip inline node using TipTap Mention extension (or custom inline node) — renders `{{token}}` as a non-editable labelled chip in the Visual tab
- [x] 6.3 Add variable picker dropdown component — shows human-readable labels, filters Stage 3 variables when editing Stage 1/2, inserts token at cursor on selection
- [x] 6.4 Add HTML source tab — `<textarea>` synced bidirectionally with TipTap HTML output; editing here updates the WYSIWYG content when switching tabs
- [x] 6.5 Add Plain text tab — independent `<textarea>` for the text body; not synced from HTML

## 7. Templates Settings Page

- [x] 7.1 Rewrite `components/settings/TemplatesClient.tsx` — add stage selector dropdown with custom-template indicators; subject input with variable picker; tabbed body editor (Visual / HTML / Plain text); Save and Reset to default buttons
- [x] 7.2 On stage change, call `GET /api/settings/templates?stage=N` and populate all fields
- [x] 7.3 On save, call `PUT /api/settings/templates` with current stage, subject, htmlBody (from TipTap), textBody
- [x] 7.4 On reset, show confirmation dialog, then call `DELETE /api/settings/templates?stage=N`, then reload defaults into editor
- [x] 7.5 Show inline success/error feedback after save and reset actions

## 8. Verification

- [ ] 8.1 Confirm end-to-end: save a custom Stage 2 template, trigger a Stage 2 send (manually via test or cron dry-run), verify custom content arrives in email
- [ ] 8.2 Confirm default path unchanged: user with no custom template receives identical email to current behaviour
- [ ] 8.3 Confirm HTML sanitisation: store a template containing `<script>alert(1)</script>` via direct DB insert, trigger send, verify script tag is stripped from sent email
- [x] 8.4 Run `npm run test` — all existing tests pass; new interpolation tests pass
- [ ] 8.5 Run `npm run verify-rls` — confirm `email_templates` RLS isolation
