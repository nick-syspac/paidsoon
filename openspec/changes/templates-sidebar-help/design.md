## Context

The Templates settings tab (`components/settings/TemplatesClient.tsx` + `TemplateEditor.tsx`) lets users write staged email reminders with dynamic variables. Currently it is a single-column `max-w-2xl` form with minimal inline hints. Users have no guidance on tone per stage and no descriptions of what each variable resolves to at send time.

The TipTap-based editor already supports variable insertion via `insertVariable()` inside `TemplateEditor`. The `TEMPLATE_VARIABLES` array (exported from `TemplateEditor.tsx`) is the single source of truth for available tokens; it currently has `token` and `label` but no human-readable description of the resolved value.

## Goals / Non-Goals

**Goals:**
- Render a sticky sidebar to the right of the Templates form on desktop showing (1) per-stage tone guidance and (2) a clickable variable reference with resolved-value descriptions.
- Clicking a variable chip in the sidebar inserts it at the cursor position in the active editor tab (Visual / HTML / Plain text).
- Stage guidance updates reactively when the stage selector changes.
- `daysOverdue` and `firmDeadline` are hidden in the sidebar unless Stage 3 is selected.

**Non-Goals:**
- Mobile / responsive layout — desktop only.
- AI-generated copy suggestions.
- Changes to any API routes or database schema.
- Changes to the `VariablePicker` dropdown inside the editor toolbar (it stays as-is).

## Decisions

### 1. Expose `insertVariable` via `useImperativeHandle` rather than lifting state

**Decision:** Add `forwardRef` + `useImperativeHandle` to `TemplateEditor`, exposing a `TemplateEditorHandle` with a single `insertVariable(v: TemplateVariable)` method. `TemplatesClient` holds a `useRef<TemplateEditorHandle>` and passes it to the sidebar.

**Alternatives considered:**
- *Lift editor state to parent* — would require moving TipTap `useEditor`, `activeTab`, and textarea refs up to `TemplatesClient`. That's a significant refactor with no other benefit.
- *Event bus / context* — overkill for a simple parent→child→sibling call with a single function.

**Why this:** Minimal change to existing code. `useImperativeHandle` is the idiomatic React pattern for exposing an imperative API from a child. The `key={stage}` re-mount already used in `TemplatesClient` naturally resets the ref to the new instance after each stage change.

### 2. Add `description` field to `TemplateVariable`

**Decision:** Extend the existing `TemplateVariable` interface with an optional `description: string` (e.g. `"e.g. £1,250.00"`). This keeps variable metadata in one place rather than duplicating it in a sidebar-specific map.

### 3. Two-column grid in `TemplatesClient`, stage selector above both columns

**Decision:** Replace `max-w-2xl` with `max-w-4xl` and switch the form area to a CSS grid (`grid-cols-[3fr_2fr]`). The stage `<select>` stays above the grid — it drives both form content and sidebar guidance, so positioning it outside both columns makes that relationship visually legible.

### 4. Sidebar implemented as a colocated component in `TemplatesClient.tsx`

**Decision:** Keep `TemplatesSidebar` in the same file as `TemplatesClient` rather than a separate file. It has no reuse surface and depends on types and constants already imported there.

## Risks / Trade-offs

- **`key={stage}` re-mount clears the ref momentarily** — Between stage changes there is a render cycle where `editorRef.current` is `null`. The sidebar's click handler must guard with optional chaining (`editorRef.current?.insertVariable(...)`). Low risk; the user cannot click before the editor re-mounts.
- **Wider container may feel inconsistent with other settings tabs** — All other tabs use `max-w-lg`. `max-w-4xl` for Templates will be noticeably wider. Acceptable because Templates is the only tab with a rich body editor; the visual distinction is appropriate.
- **`document.querySelector` in `insertVariable` for HTML/text tabs** — The existing implementation already uses `document.querySelector("[data-html-source]")`. This is an existing coupling, not new. No change needed here.
