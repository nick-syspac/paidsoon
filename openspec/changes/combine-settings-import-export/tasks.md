## 1. Settings navigation and route shell

- [x] 1.1 Replace the separate Import and Invoice exports tabs with one combined Settings tab.
- [x] 1.2 Create the combined settings route and shared page shell for import/export content.

## 2. Workflow composition

- [x] 2.1 Reuse the existing invoice import and invoice export clients inside the combined page.
- [x] 2.2 Add the expense import section and wire it to the existing spend-import workflow.
- [x] 2.3 Remove the redundant standalone invoice-export heading from the nested export section.

## 3. Compatibility and verification

- [x] 3.1 Add redirects or aliases for the old import and export routes so deep links continue to work.
- [x] 3.2 Add or update tests for the combined tab, legacy-route behavior, and section rendering.
- [x] 3.3 Update documentation references for the new combined Settings surface if needed.