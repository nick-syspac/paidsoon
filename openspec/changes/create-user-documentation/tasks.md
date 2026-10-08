# Tasks

## 1. Guide entry point and account setup

- [x] 1.1 Create `docs/user/index.md` and `docs/user/getting-started.md` with the manual’s scope, reading order, prerequisites, first-login path, and links to the settings guides; verify the index lists every requested module and the sequence begins with account setup.
- [x] 1.2 Create `docs/user/general-settings.md` for Account, Connections, and Subscription, including the current account-editing limits, connection/sync flow, billing actions, and a non-promissory note about Team if that entry is visible; verify names, routes, and claims against the current settings pages and plan catalog.

## 2. InvoiceGuard setup and data movement

- [x] 2.1 Create `docs/user/invoiceguard.md` covering Schedule, Email, and Templates setup and use; verify timing, sender options, template stages, and tier limits against the current settings UI and feature catalog, and do not describe unimplemented per-customer template behavior as available.
- [x] 2.2 Extend `docs/user/invoiceguard.md` with Import / Export instructions; verify that invoice import is CSV, expense import accepts CSV/XLSX, invoice exports and MarginGuard exports are distinct, CommitGuard transfer is settings-only JSON, and none is a full account backup.

## 3. Operations modules

- [x] 3.1 Create `docs/user/depositguard.md` and `docs/user/spendleak.md` with access prerequisites, settings setup, core dashboard/review workflows, and current limitations; verify each guide against its settings and dashboard routes and feature-access logic.
- [x] 3.2 Create `docs/user/owners-digest.md` and `docs/user/commitguard.md` covering Digest configuration/history and commitment setup/review; verify Digest delivery eligibility and UTC timing, and clearly exclude unavailable team, approval, or other unimplemented workflows.

## 4. Financial insight modules

- [x] 4.1 Create `docs/user/cost-guard.md` and `docs/user/marginguard.md` with settings, dashboard interpretation, data prerequisites, and relevant plan access; verify every stated control and explicitly flag Cost Guard’s static/sample-like output instead of presenting it as live data.
- [x] 4.2 Create `docs/user/runwayguard.md` with forecast prerequisites and settings interpretation; verify that sample-like forecast output is identified as not a confirmed live account forecast.
- [x] 4.3 Create `docs/user/tax-buffer.md` and `docs/user/cashplan.md` covering setup/interpretation and current access boundaries; verify Tax Buffer is framed as an estimate rather than advice and CashPlan settings are described as a read-only review.

## 5. Cross-guide review

- [x] 5.1 Review every file under `docs/user/` for coverage of the requested sections, consistent product labels, factual plan/access statements, resolved relative Markdown links, and absence of secrets/customer data; run `git diff --check` and confirm no application code or `content/help/` files were changed.
