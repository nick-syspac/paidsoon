## Context

The Templates settings page has been scaffolded since the initial build but has never been functional. The `PUT /api/settings/templates` route accepts a `subject` and `body` but neither persists them nor uses them when the cron sends emails. The audience for PaidSoon skews non-technical (freelancers, sole traders) — many will not be comfortable with any kind of markup or variable syntax. The current blank textarea provides no guidance and would produce confusion.

The cron job (`app/api/cron/send-emails`) currently calls `renderStage1/2/3()` which are hardcoded JavaScript template literal functions. There is no branch to use a user's custom template, and no interpolation engine shared between the two paths.

## Goals / Non-Goals

**Goals:**
- Make template customisation fully functional end-to-end (persist, retrieve, apply at send time)
- Provide a WYSIWYG editor that non-technical users can operate without training
- Allow independent customisation of Stage 1, 2, and 3
- Pre-fill each stage with the existing default so users have a working starting point
- Unify the render path so built-in defaults and custom templates go through the same interpolation
- Sanitise user-authored HTML server-side before sending

**Non-Goals:**
- Template versioning or history
- Shared/team templates
- Image embedding in templates
- Preview of rendered email with real invoice data
- Per-invoice template overrides

## Decisions

### 1. TipTap as the WYSIWYG editor

**Decision**: Use TipTap (`@tiptap/react` + `@tiptap/starter-kit` + extensions).

**Rationale**: TipTap is headless and React-first, works cleanly with Tailwind CSS 4, has the best support for custom inline nodes (used for variable chips), and is actively maintained. It produces clean HTML output suitable for Resend.

**Alternatives considered**:
- **React-Quill**: Older, known React 18 issues with SSR and `findDOMNode` warnings
- **Lexical**: More performant but significantly more complex to set up custom nodes
- **Jodit**: Has built-in source/design toggle but is jQuery-rooted and heavier

### 2. New `EmailTemplate` table (not JSON on UserProfile)

**Decision**: New Prisma model `EmailTemplate` with `@@unique([userId, stage])`.

**Rationale**: A dedicated table is queryable, indexable, has its own RLS policy, and is extensible (future: per-template active/inactive flag, template versioning). JSON blobs on UserProfile would require deserialising the whole profile row to check one template.

### 3. Three independently editable tabs (Visual, HTML, Plain text)

**Decision**: WYSIWYG, HTML source, and plain text are all independently editable. Switching tabs does not auto-convert content between them.

**Rationale**: Auto-stripping HTML to plain text produces poor results (lost link text, collapsed whitespace). Users who care about their plain-text fallback should be able to write it deliberately. WYSIWYG ↔ HTML source are two views of the same HTML string and do sync bidirectionally.

**Trade-off**: Users must maintain two versions. Mitigated by pre-filling both from the default template.

### 4. Unified interpolation engine

**Decision**: Refactor `renderStage1/2/3()` in `lib/email/templates.ts` to use a shared `interpolate(template: string, vars: TemplateVars): string` function. Built-in defaults become static template strings with `{{variable}}` placeholders. Custom templates are stored as the same format and pass through the same function.

**Rationale**: A single code path reduces divergence. The built-in defaults can serve as the seed for the editor's pre-fill. The same function is called whether the user has a custom template or not.

### 5. Simplified variable set exposed to users

**Decision**: Expose a pre-resolved, simplified variable set rather than raw `TemplateVars`. Conditional logic (e.g. `invoiceNumber` may be absent) is handled by the system before interpolation.

| User-facing token | Resolved value |
|---|---|
| `{{clientName}}` | Client's full name |
| `{{invoiceRef}}` | "Invoice INV-042" or "your invoice" if absent |
| `{{amountDue}}` | Formatted currency string |
| `{{dueDate}}` | Formatted date string |
| `{{paymentLink}}` | Anchor tag if URL exists, empty string if not |
| `{{yourName}}` | Freelancer's name |
| `{{daysOverdue}}` | Integer (Stage 3 only; empty string for Stage 1/2) |
| `{{firmDeadline}}` | Formatted date string (Stage 3 only) |

### 6. Server-side HTML sanitisation before send

**Decision**: Use `sanitize-html` in `lib/email/send.ts` to sanitise `htmlBody` before passing to Resend. Allow a safe subset: block-level elements, inline formatting, `<a>` with `href`/`target`. Strip `<script>`, event handlers, and `style` attributes.

**Rationale**: Users can edit raw HTML in the source tab. Without sanitisation, a user could inadvertently (or maliciously) introduce XSS vectors into emails sent to their clients.

### 7. Variable chips in WYSIWYG via TipTap Mention extension

**Decision**: Repurpose TipTap's Mention extension to render `{{variable}}` tokens as non-editable inline chip nodes in the Visual tab. The underlying document still stores `{{variable}}` syntax in HTML output.

**Rationale**: Non-technical users should never see double-curly-brace syntax. Chips look like Word's mail-merge fields and are immediately understandable.

## Risks / Trade-offs

- **TipTap version compatibility with Tailwind CSS 4** → TipTap is headless (no built-in styles). We supply all toolbar and chip styles ourselves — no conflict risk.
- **HTML sanitisation too aggressive strips legitimate formatting** → Configure `sanitize-html` allowlist explicitly; test against the default templates to confirm they pass through unmodified.
- **Stage dropdown UX: users may not realise they need to save each stage separately** → Show a "Saved" confirmation per stage, and add a visual indicator (dot or checkmark) on the dropdown option when a custom template exists for that stage.
- **Default template strings diverge from `renderStage1/2/3()` output** → After refactor, the built-in render functions call `interpolate(DEFAULT_STAGE_N, vars)` so there is one source of truth for default content.
- **`sanitize-html` is a runtime dependency** → It runs server-side only (in the send path and route handler). No bundle impact on the client.

## Migration Plan

1. Run `prisma migrate dev --name add-email-templates` to create the `email_templates` table
2. Apply updated `rls-policies.sql` to the database
3. Deploy updated `lib/email/templates.ts` (interpolation refactor) — this is non-breaking; existing send behaviour is unchanged as no user templates exist yet
4. Deploy updated `app/api/settings/templates/route.ts` and `lib/email/send.ts`
5. Deploy updated `components/settings/TemplatesClient.tsx`
6. No data migration required — absence of a row means "use default", which is the current behaviour

**Rollback**: Remove `EmailTemplate` rows (or truncate table) and redeploy previous `send.ts`. The built-in render functions remain in place throughout.

## Open Questions

- Should Stage 3 variables (`{{daysOverdue}}`, `{{firmDeadline}}`) be hidden in the variable picker when editing Stage 1 or Stage 2, or shown but labelled as "Stage 3 only"? Leaning toward hiding to reduce cognitive load.
- Should the "HTML source" tab be behind an "Advanced" toggle to avoid overwhelming non-technical users? Leaning toward always visible but de-emphasised (smaller tab, greyed label).
