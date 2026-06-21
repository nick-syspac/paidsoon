## Why

The Templates settings page is scaffolded but non-functional: custom templates are accepted by the API but never persisted or used when sending emails. Non-technical users (the primary audience) have no way to personalise reminder emails, no guidance on what to write, and no understanding of what variables are available. This change makes template customisation real and usable by people with no technical background.

## What Changes

- Add a new `EmailTemplate` database table to persist custom templates per user per stage
- Introduce a WYSIWYG rich-text editor (TipTap) as the primary editing surface, replacing the plain textarea
- Add a stage selector dropdown so users can independently customise Stage 1, Stage 2, and Stage 3
- Add three editing tabs: Visual (WYSIWYG), HTML source, and Plain text — independently editable
- Add a click-to-insert variable picker so users never need to type `{{variable}}` syntax manually
- Pre-fill the editor with the current default template for the selected stage so users have a starting point
- Add a "Reset to default" button per stage
- Unify the send-time render path so custom templates and built-in defaults use the same interpolation function
- Add server-side HTML sanitisation before any custom template is sent via Resend
- **BREAKING**: The `PUT /api/settings/templates` route signature changes to include `stage`, `htmlBody`, and `textBody` fields replacing the current `body` field

## Capabilities

### New Capabilities

- `template-editor`: WYSIWYG editing UI with stage selector, three-tab body editor (visual/HTML/plain text), variable picker, pre-filled defaults, and reset-to-default behaviour
- `template-persistence`: Storing and retrieving custom `EmailTemplate` records per user per stage, including Prisma schema, migration, and RLS policy
- `template-interpolation`: Send-time variable substitution engine shared by both built-in and custom templates, with a defined simplified variable set and server-side HTML sanitisation

### Modified Capabilities

<!-- No existing specs to modify — this is all new -->

## Impact

- **`prisma/schema.prisma`**: New `EmailTemplate` model
- **`prisma/rls-policies.sql`**: New RLS policy for `email_templates` table
- **`lib/email/templates.ts`**: Refactor stage render functions to use shared interpolation; add default template strings with `{{variable}}` placeholders
- **`lib/email/send.ts`**: Check for custom template at send time; apply interpolation and sanitisation
- **`app/api/settings/templates/route.ts`**: Updated GET (by stage) and PUT (persist to DB) handlers
- **`components/settings/TemplatesClient.tsx`**: Full replacement with TipTap-based editor
- **New packages**: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-underline`, `@tiptap/extension-link`, `@tiptap/extension-placeholder`, `sanitize-html`, `@types/sanitize-html`
