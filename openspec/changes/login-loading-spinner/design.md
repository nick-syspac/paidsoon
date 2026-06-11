## Context

The sign-in (`app/(auth)/sign-in/page.tsx`) and sign-up (`app/(auth)/sign-up/page.tsx`) pages both track a `loading` boolean state. When `true`, the submit button is disabled and its label changes to plain text (e.g. "Signing in..."). There is no animated visual indicator. Both pages share a near-identical button pattern.

The project uses Tailwind CSS for styling and React for UI. There is no existing spinner component in `components/`.

## Goals / Non-Goals

**Goals:**
- Show an animated spinning circle inside the submit button during the auth request.
- Apply consistently to both sign-in and sign-up forms.
- Keep the implementation simple and self-contained with no new npm dependencies.

**Non-Goals:**
- Full-page loading overlay or skeleton screens.
- Spinner on the Google OAuth button (redirect is instant; no async wait state to show).
- Any changes to authentication logic or error handling.

## Decisions

### 1. Inline SVG spinner vs. external icon library

**Decision**: Inline SVG animated with a Tailwind `animate-spin` class inside a shared `components/ui/Spinner.tsx` component.

**Rationale**: No new dependency needed. Tailwind already ships `animate-spin`. An inline SVG circle with a partial stroke is the idiomatic pattern used across the Next.js / Tailwind ecosystem. An icon library (e.g. `lucide-react`) would work but adds a dependency and import for a single use case.

**Alternative considered**: CSS `border` spinner (top-border trick). Rejected — the SVG approach is more accessible and easier to size/colour consistently.

### 2. Shared component vs. duplicated inline JSX

**Decision**: Create `components/ui/Spinner.tsx` exporting a `<Spinner />` component with optional `size` and `className` props.

**Rationale**: Both auth pages use the same spinner; a shared component avoids duplication and keeps both pages in sync if the design changes.

### 3. Button content while loading

**Decision**: Show `<Spinner /> <span>Signing in…</span>` (or "Creating account…") inside the button, retaining the label so the button width does not collapse.

**Rationale**: Retaining text alongside the spinner prevents layout shift and keeps the action legible for screen readers.

## Risks / Trade-offs

- **Tailwind `animate-spin` purge** → No risk; `animate-spin` is a core Tailwind utility and will not be purged.
- **SVG colour inheritance** → The SVG uses `currentColor`, so it inherits the button's text colour automatically. No extra class needed.

## Open Questions

None. This is a self-contained UI-only change.
