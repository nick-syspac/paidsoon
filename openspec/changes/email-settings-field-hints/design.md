## Context

`EmailSettingsClient.tsx` renders a form with three inputs — From email, From name, and Reply-to — that are shown only to users on Solo+ plans (`canUseOwnEmail: true`). Currently none of the inputs have per-field guidance. The form has a single intro paragraph that loosely covers verification, but it sits above all fields and is easily skipped.

The codebase already uses `<p className="text-xs text-gray-400 mt-1">` for inline hint text (see `StripeConnectionClient.tsx`, `TemplatesClient.tsx`). No new patterns are needed.

## Goals / Non-Goals

**Goals:**
- Add concise hint text below each of the three form inputs
- Move verification context from the shared intro paragraph to the From email field hint
- Keep the intro paragraph but trim its duplicate content

**Non-Goals:**
- Tooltip or popover patterns (not needed for this brevity of copy)
- Any changes to API, data model, or validation logic
- Changes to the locked/upgrade state shown to Starter users

## Decisions

**D1 — Inline `<p>` hint text, not a tooltip icon**

The hints are short (one sentence each). Inline text below the input is immediately visible without interaction, consistent with the existing codebase pattern, and accessible without additional ARIA work. A tooltip icon (ⓘ) would add complexity for no UX gain at this copy length.

**D2 — Exact hint copy**

| Field | Hint |
|---|---|
| From email | `Use a dedicated address like collections@yourcompany.com. We'll send a verification link when you save.` |
| From name | `Your business name as it appears to clients — e.g. "Acme Ltd" or "Acme Consulting".` |
| Reply-to | `Optional. Client replies land here instead of your From address.` |

**D3 — Trim intro paragraph**

Remove "You'll need to verify the email before it's used." from the intro paragraph since it is now covered at field level. Keep the rest of the intro and the pending/verified status spans.

## Risks / Trade-offs

- [Copy staleness] Hint text is hardcoded. If the verification flow changes, these hints need updating. → Low risk; hints are non-functional and easy to update.
