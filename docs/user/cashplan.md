# CashPlan

**Bounded cash-protection integration: LOCAL / UNMERGED / NOT DEPLOYED.** This guide
describes verified local source and offline fixtures, not production availability
or completed rollout acceptance.

CashPlan provides a preliminary 13-week cash estimate. Its settings page remains
a **read-only review** of plan name, currency, timezone, horizon, buffer target and
review role; it does not add settings, refresh or manual-item controls.

The review requires sign-in and current subscription access. There is no new
CashPlan feature gate; Essentials retains core CommitGuard contribution.

## Review the current plan

Open **Settings → Cash Plan** at `/settings/cash-plan`. Review:

- **Preliminary status** or an explanation that cash amounts are unavailable.
- **Confidence** and **Lowest cash** as shown for the current forecast.
- **Current plan settings:** plan name, currency, timezone, forecast horizon in weeks, buffer target, and review role.
- **Recommended actions** for the current status.

The dashboard overview also includes a **Cash posture** card with status, confidence, lowest cash, freshness, and recommended actions. Its forecast-settings/review links open the same Cash Plan settings page.

## Understand the exact source boundary

The review, summary/items/settings APIs, overview and CashPlan digest provider use
the same current source assembler, not a saved weekly-total fallback. It includes:

- Eligible compatible CommitGuard occurrences, excluding paused/cancelled/expired
	and archived commitments, with stable source dates and identities.
- Only explicitly linked unpaid imported bills that are included in the same
	currency/window and have a supported saved remaining balance. Current balance
	support is numeric Xero `AmountDue` or MYOB `BalanceDue`; this is not full provider
	coverage or an automatic provider call. Unlinked bills are not imported here.
- Valid dated manual items and latest valid overrides of known source facts.
	Untimed legacy manual rows remain visible for timing review, not assigned guessed dates.
- Version-2 saved facts only when their source references, currency, anchor,
	revisions, coverage and hash can be reconstructed from current records.

For example, a 6000-cent included bill covering a 10000-cent commitment leaves
4000 cents of commitment outflow. A paid, absent, excluded, incompatible or
out-of-window bill cannot reduce that commitment. There is no supplier-name match.

Receivables are missing and payables are only partially covered. Commitment-only
projections are explicitly preliminary, not a complete account forecast. Calendar,
explanation, data-quality, periods, export and scenario views are outside this
bounded consumer update and must not be assumed to have the same source coverage.

## Gross cash, freshness and history

Save **gross cash**, including reserved money, with its currency and UTC balance
date in CommitGuard's owner-input form. CashPlan never opens with protected free
cash or subtracts tax reserves/safety buffers as extra cash movements. A real
tax commitment still contributes as an occurrence. There is no automatic bank
balance, intervening-payment reconciliation or FX conversion.

Cash remains usable through UTC day seven; on day eight it is stale. An earlier
but still-fresh balance is labeled a dated unreconciled estimate, not today's
verified bank balance. Missing, stale or incompatible opening cash displays
unavailable amounts, never an invented zero. Week zero uses the selected plan's
local evaluation date and timezone, including daylight-saving changes.

Disabling CommitGuard removes its commitment/linked-bill contribution but retains
saved cash, editable records, coverage and history. Independent dated manual items
remain. Revoked subscription access blocks financial reads.

Legacy and superseded version-2 snapshots remain history; they are not merged into
the current projection or rewritten by a page visit. Only explicit summary POST
refresh or the trusted evaluation job appends a new version-2 snapshot. The job
remains gated off pending authorized rollout. The read-only review page does not
provide that POST control. Maintain inputs through supported module workflows,
then review the updated estimate; do not use it as an accounting ledger.

## Related guides

- [Tax Buffer](tax-buffer.md) — reserve protection is separate from CashPlan movements.
- [CommitGuard](commitguard.md) — maintain tracked commitments.
- [RunwayGuard](runwayguard.md) — note that its current dashboard forecast is sample-like, not a verified live account forecast.
- [Connections and subscription](general-settings.md) — connect financial data sources.
