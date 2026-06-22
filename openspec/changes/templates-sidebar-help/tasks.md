## 1. Extend TemplateVariable type

- [x] 1.1 Add optional `description: string` field to the `TemplateVariable` interface in `TemplateEditor.tsx`
- [x] 1.2 Add `description` values to all entries in the `TEMPLATE_VARIABLES` array (e.g. `"e.g. Jane Smith"`, `"e.g. INV-0042"`, `"e.g. £1,250.00"`, `"e.g. 15 June 2026"`, `"Stripe-hosted payment URL"`, `"your display name"`, `"e.g. 12"`, `"e.g. 30 June 2026"`)

## 2. Expose insertVariable from TemplateEditor

- [x] 2.1 Define a `TemplateEditorHandle` interface with a single method: `insertVariable(v: TemplateVariable): void`
- [x] 2.2 Convert `TemplateEditor` to use `forwardRef<TemplateEditorHandle, TemplateEditorProps>`
- [x] 2.3 Add `useImperativeHandle` inside `TemplateEditor` to expose `insertVariable` on the forwarded ref

## 3. Build the TemplatesSidebar component

- [x] 3.1 Define `STAGE_GUIDANCE` constant (keyed by stage 1/2/3) with a `tone` label and `description` string for each stage
- [x] 3.2 Create a `TemplatesSidebar` component (colocated in `TemplatesClient.tsx`) that accepts `stage`, `onInsert` callback, and renders the stage guidance block
- [x] 3.3 Add the variable reference list to `TemplatesSidebar` — filter by stage (hide `stage3Only` vars unless stage === 3), render each as a clickable chip that calls `onInsert`
- [x] 3.4 Style the sidebar as `sticky top-6` with appropriate spacing and visual separation from the form

## 4. Wire sidebar into TemplatesClient layout

- [x] 4.1 Add `editorRef = useRef<TemplateEditorHandle>(null)` in `TemplatesClient`
- [x] 4.2 Pass `ref={editorRef}` to `<TemplateEditor />`
- [x] 4.3 Replace `max-w-2xl` container with `max-w-4xl` and a two-column grid (`grid-cols-[3fr_2fr]`)
- [x] 4.4 Move stage selector above the grid (spanning full width)
- [x] 4.5 Render `<TemplatesSidebar>` in the right column, passing `stage` and `onInsert={v => editorRef.current?.insertVariable(v)}`
- [x] 4.6 Confirm `key={stage}` on `<TemplateEditor>` is still present (forces re-mount on stage change)
