## Context

The repo lives at `~/paidsoon`, suggesting the rename was intended from the start, but the product copy, the npm package name, and the outbound email sender still say "Invoice Nudge". A `grep` for the old name finds ~34 occurrences spread across UI, configuration, prisma file headers, and `docs/SETUP.md`. The rename is mostly mechanical but has one moving part with real-world consequence — the email sending domain.

## Goals / Non-Goals

**Goals**
- Every user-visible string in the running application says "PaidSoon".
- The npm package, prisma file headers, and setup docs say "PaidSoon" / `paidsoon`.
- Outbound email sender identity (`From` header and display name) is `PaidSoon <billing@paidsoon.com>`, with `Reply-To` unchanged.
- The `email-settings` capability spec reflects the new From header so future changes don't reintroduce the old strings.

**Non-Goals**
- Renaming the historical OpenSpec change folder `invoice-nudge-mvp/`. Change IDs are stable identifiers; renaming would rewrite history and break links.
- Renaming the Git repo, GitHub project, or any external system (Vercel project, Supabase project, Stripe account name). Those are operator decisions.
- Replacing logos, favicons, OG images, or any visual asset.
- A redirect from `invoicenudge.com` to `paidsoon.com`. Out of scope; track separately if `invoicenudge.com` was ever live.

## Decisions

### D1: New brand string is "PaidSoon" (one word, capital P, capital S)

**Decision:** Wherever the old brand appeared as display text — page chrome, marketing copy, email From name, Stripe product name — use `PaidSoon`. Wherever it appeared as a slug / identifier (npm package, Resend domain) use `paidsoon` (lowercase, no hyphen).

**Rationale:** The workspace directory `paidsoon/` already implies this casing, and one-word slugs are easier to type in env vars and CLI flags than `paid-soon`.

**Alternative considered:** `paid-soon` (kebab-case) for slugs. Rejected — adds noise without aiding readability for a single-syllable compound.

---

### D2: System email domain becomes `paidsoon.com`; gate the env flip on Resend verification

**Decision:** The runtime From address is `billing@paidsoon.com`. The default fallback in `app/dashboard/settings/email/page.tsx` updates in the same commit. **However**, the `RESEND_FROM_EMAIL` / `RESEND_FROM_NAME` env vars in production (Vercel) and local (`.env.local`) flip only after `paidsoon.com` has been DNS-verified in Resend.

The code change and the env-var change are decoupled by ordering: the fallback string is the new domain, but as long as `RESEND_FROM_EMAIL` is set, the code reads from the env var, so existing deployments keep sending from the old address until the operator flips both Resend verification and the env var together.

**Rationale:** If the code change shipped before Resend was ready, outbound email would silently fail (Resend rejects unverified senders). Decoupling via env-var precedence avoids that window.

**Alternative considered:** Hard-code the new domain and ship together with Resend verification in a single push. Rejected — couples a code deploy to a DNS / external-vendor step, which is exactly the kind of coupling that causes outages.

---

### D3: Leave the historical change folder name `invoice-nudge-mvp/` alone

**Decision:** Inside that folder, the prose still references "Invoice Nudge" as the historical product name. We do not rewrite that history. We only update the `email-settings` spec strings that describe the *current* email contract, since that contract is changing as part of this rename.

**Rationale:** OpenSpec change IDs are referenced from other artifacts (e.g. `enforce-rls-via-prisma/tasks.md` mentions `invoice-nudge-mvp/design.md`). Renaming would break those links, and the change folder is a snapshot of a past decision, not a description of the live product.

**Alternative considered:** Rename to `paidsoon-mvp/` and grep-fix references. Rejected — high blast radius for cosmetic gain.

---

### D4: Update `email-settings` spec, not the entire MVP spec

**Decision:** The only spec content that names the brand in a normative way is the `email-settings` Free-tier From-header requirement. That single requirement is rewritten with the new strings. Other MVP specs that mention "Invoice Nudge" in non-normative context (proposal narrative, design background) are left alone.

**Rationale:** Specs encode behavior, not branding. The From-header strings are part of the behavioral contract (a user can observe them in their inbox) and so they belong in the spec. Background prose does not.

---

### D5: Defer the marketing-domain `invoicenudge.com` decision

**Decision:** This change does nothing about `invoicenudge.com` itself — whether to redirect, park, or release the domain. It only ensures that the codebase and Resend sending identity move to `paidsoon.com`.

**Rationale:** That decision needs operator input (does the domain exist? was it used in any user-visible link? are there inbound emails to forward?) and shouldn't block the code-level rename.

## Risks / Trade-offs

- **Email-deliverability blast radius**: if the env-var flip happens before Resend verification, outbound follow-up emails fail. Mitigated by D2 (decoupled ordering) and the explicit runbook step in `tasks.md`.
- **Brand inconsistency window**: between the code merge and the env-var flip, the UI says "PaidSoon" but emails still come from `billing@invoicenudge.com`. This is brief and acceptable — a recipient sees the discrepancy at worst once, and only if they happen to log in during the window.
- **Stale references**: `invoicenudge.com` may still appear in other artifacts we haven't grepped (Resend templates, Stripe receipts, transactional metadata). The verification step in `tasks.md` includes a final `grep` pass over the repo and a manual check of one live send.

## Open Questions

- **Domain ownership**: is `paidsoon.com` already registered to the project, or does it need to be acquired? If unowned, the entire rename is blocked on registration + DNS.
- **Stripe product / dashboard renames**: do we also rename the Stripe Connect application name and the Stripe Billing product name now, or in a follow-up? Setup docs currently use "Invoice Nudge Pro" as an example.
- **Old domain disposition**: park, 301-redirect to `paidsoon.com`, or release? (Tracked separately per D5.)
