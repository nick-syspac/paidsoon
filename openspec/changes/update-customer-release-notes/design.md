## Context

PaidSoon already stores release notes in:
- `docs/release-notes/customer-release-notes.md` (customer-facing)
- `docs/release-notes/internal-release-notes.md` (engineering-facing)

Both files are chronological and template-driven, but there is no explicit
change-scoped workflow ensuring customer notes are updated when internal notes are
updated. The most common failure mode is incomplete customer wording (too internal,
too vague, or not aligned to visible behavior).

## Goals / Non-Goals

**Goals:**
- Ensure customer release notes are updated for each release in a consistent format.
- Keep language outcome-focused and customer-safe (no sensitive implementation
  details or security internals).
- Preserve traceability using shared internal release IDs between internal and
  customer notes.

**Non-Goals:**
- No automation tooling or CI enforcement in this change.
- No product feature implementation.
- No historical rewrite of older release entries unless they are factually wrong.

## Decisions

**1. Keep customer release notes as the canonical customer document.**
The file remains `docs/release-notes/customer-release-notes.md`, newest-first,
with one entry per release.

**2. Reuse the existing customer template exactly.**
Every new entry must include all existing section headings. This avoids format
drift and keeps support and product teams aligned on where to find details.

**3. Use internal release ID as the cross-file join key.**
Each customer entry includes the same internal reference ID as the internal
release entry, enabling easy audit and support traceability.

**4. Apply a customer-safe wording filter.**
Items included in customer notes should describe visible outcomes only, and should
not expose internal architecture or exploit-sensitive specifics.

## Risks / Trade-offs

- **Risk:** Internal engineering details may leak into customer notes.
  - **Mitigation:** Add a wording review pass against a customer-safe checklist.
- **Risk:** Customer notes may overstate delivered functionality.
  - **Mitigation:** Require each bullet to map to shipped behavior confirmed by
    release owner notes.
- **Trade-off:** Manual process is simple but not enforced automatically.
  - **Mitigation:** Document checklist and include it in release workflow tasks.

## Migration Plan

1. Draft the newest customer release entry at the top of
   `docs/release-notes/customer-release-notes.md`.
2. Ensure the internal release reference ID matches
   `docs/release-notes/internal-release-notes.md`.
3. Validate section completeness against the template.
4. Run doc quality pass (clarity, customer-safe wording, no non-shipped claims).
5. Publish with release.

## Open Questions

- Should we add CI linting later to enforce required customer-release-note
  headings for each new entry?
- Should support impact be expanded from `low|medium|high` to include
  customer-action guidance labels?