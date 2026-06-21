# Skill: Documentation Maintenance — PaidSoon

## When to Use This Skill
Use when updating, auditing, or restructuring PaidSoon documentation to ensure it reflects the current codebase accurately.

## Status
Confirmed applicable to this codebase.

## Inputs Required
- What changed (new feature, schema change, new API route, new env var)
- Which doc files need updating

## Files to Inspect
- `docs/DDD.md` — primary design document
- `docs/HLD.md` — high-level design
- `docs/runbooks/README.md` — env var matrix and setup order
- `docs/runbooks/resend.md` — Resend service guide
- `docs/runbooks/supabase.md` — Supabase guide
- `docs/runbooks/stripe.md` — Stripe guide
- `docs/runbooks/vercel.md` — Vercel deployment guide
- `prisma/schema.prisma` — source of truth for DB model
- `lib/subscriptionPlans.ts` — source of truth for plans
- `app/api/` — source of truth for API routes

## Documentation Ownership

| Doc | Owner area | Update trigger |
|---|---|---|
| `docs/DDD.md` | Architecture + API routes | New feature, schema change, new route |
| `docs/HLD.md` | High-level context | Major architecture change |
| `docs/runbooks/README.md` | Env vars | New env var added or removed |
| `docs/runbooks/stripe.md` | Stripe setup | Webhook or plan change |
| `docs/runbooks/supabase.md` | Supabase setup | Schema, auth, or RLS change |
| `docs/runbooks/vercel.md` | Deployment | Cron, build, or runtime change |

## Rules to Follow

1. **Codebase is source of truth.** When docs conflict with code, update the docs.
2. **Only document as implemented** what is confirmed working in the current codebase.
3. **Scaffolded features** must be labelled: "Scaffolded — not fully implemented".
4. **Planned features** must be labelled: "Planned — not yet implemented".
5. After removing a scaffolded label, verify the feature actually works end-to-end.
6. Do not duplicate information between docs — reference the canonical source.

## Scaffolded Features (Current — June 2026)

Must be clearly labelled in `docs/DDD.md`:
- **AI rewrite / tone settings** — scaffolded, routes return placeholders
- **Custom email templates** — scaffolded, routes not persistent
- **Team seats / invites** — scaffolded, invite route non-persistent

## API Routes Table in DDD.md

Should match `app/api/` directory exactly:

| Route | Methods | Purpose |
|---|---|---|
| `/api/billing/checkout` | POST | Stripe Checkout session |
| `/api/billing/portal` | POST | Stripe Customer Portal |
| `/api/cron/send-emails` | GET | Daily email dispatcher |
| `/api/invoices/[id]/pause` | POST | Pause invoice |
| `/api/invoices/[id]/resume` | POST | Resume invoice |
| `/api/invoices/[id]/snooze` | POST | Snooze invoice |
| `/api/invoices/[id]/resolve` | POST | Manually resolve invoice |
| `/api/settings/ai` | GET, PUT | AI settings (scaffolded) |
| `/api/settings/email` | GET, PUT | Email settings |
| `/api/settings/schedule` | GET, PUT | Email schedule config |
| `/api/settings/team/invite` | POST | Team invite (scaffolded) |
| `/api/settings/templates` | GET, PUT | Custom templates (scaffolded) |
| `/api/stripe/connect/authorize` | GET | Stripe Connect OAuth |
| `/api/stripe/connect/callback` | GET | OAuth callback |
| `/api/stripe/connect/disconnect` | POST | Deactivate connection |
| `/api/webhooks/stripe-billing` | POST | Billing webhook |
| `/api/webhooks/stripe-connect` | POST | Connect webhook |

## Common Mistakes to Avoid
- Documenting planned features as implemented
- Forgetting to update the API routes table after adding a route
- Not updating `docs/runbooks/README.md` when adding env vars
- Removing scaffolded labels before the feature is fully implemented
- Duplicating content between `DDD.md` and runbooks

## Output Format
- Updated Markdown files with clear section headers
- No invented or aspirational content
- All file/code references are valid paths

## Acceptance Checklist
- [ ] `docs/DDD.md` API routes table matches `app/api/` directory
- [ ] Scaffolded features labelled accurately
- [ ] All new env vars in `docs/runbooks/README.md`
- [ ] No planned features documented as complete
- [ ] Markdown is valid and well-structured
