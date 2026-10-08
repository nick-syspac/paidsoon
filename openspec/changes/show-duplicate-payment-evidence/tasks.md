# Tasks

## 1. Matched transaction evidence

- [x] 1.1 Add source-linked evidence rows for the exact two transactions selected by the existing duplicate-payment detector while retaining its current evidence keys; verify with engine tests that the emitted rows contain the expected IDs, dates, amounts, descriptions, and counterparties and that duplicate selection is unchanged.

## 2. Duplicate comparison presentation

- [x] 2.1 Render duplicate-payment counterparty and matched transaction rows in the Duplicate comparison detail using the existing responsive evidence-table pattern; verify with presentation and component tests that both records and their source references are shown, legacy missing-row evidence uses explicit fallbacks, and duplicate-spend bill rows remain unchanged.

## 3. Integration verification

- [x] 3.1 Run the complete test suite and validate the OpenSpec change; verify that all tests pass and the change artifacts pass validation.