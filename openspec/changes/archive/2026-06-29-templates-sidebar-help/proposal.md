## Why

The Templates settings tab is the most complex screen in PaidSoon — users write staged email copy with dynamic variables — but it provides almost no contextual help. Users have no guidance on what tone to use per stage, no descriptions of what each variable resolves to, and no way to insert a variable without opening a dropdown. This leads to poorly written reminders and underuse of the variable system.

## What Changes

- Add a sticky sidebar panel to the right of the Templates form (desktop layout only).
- The sidebar has two sections: **Stage guidance** (tone / intent description per stage, updates reactively when the stage selector changes) and **Variables reference** (all available variables with plain-English descriptions of their resolved values).
- Each variable in the sidebar is a clickable chip that inserts the variable at the current cursor position in the editor (Visual, HTML, or Plain text tab).
- Expose `insertVariable` from `TemplateEditor` via `useImperativeHandle` / `forwardRef` so the parent can call it from the sidebar.
- Add a `description` field to `TemplateVariable` in `TemplateEditor.tsx` (e.g. `"e.g. £1,250.00"`).
- Widen the Templates outer container from `max-w-2xl` to `max-w-4xl` to accommodate the two-column grid.
- Stage selector remains above both columns (it drives both form content and sidebar guidance).
- `daysOverdue` and `firmDeadline` variables remain Stage 3–only in the sidebar, matching existing `VariablePicker` logic.

## Capabilities

### New Capabilities
- `templates-sidebar`: Sticky contextual sidebar alongside the Templates editor showing per-stage tone guidance and a clickable variable reference.

### Modified Capabilities
<!-- No existing spec-level requirements are changing — this is purely additive UI. -->

## Impact

- `components/settings/TemplateEditor.tsx` — add `description` to `TemplateVariable`, add `forwardRef` + `useImperativeHandle` exposing `insertVariable`.
- `components/settings/TemplatesClient.tsx` — switch to two-column grid layout (`max-w-4xl`), add `TemplatesSidebar` component, wire `editorRef`.
- No API changes, no schema changes, no new dependencies.
- Desktop-only; no mobile breakpoint handling required.
