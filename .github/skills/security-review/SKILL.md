# Skill: Security Review — PaidSoon

## When to Use This Skill
Use when performing a security review of a new feature, API route, webhook handler, or any code that handles user data, authentication, or payment information.

## Status
Confirmed applicable to this codebase.

## Inputs Required
- Code area or files to review
- Specific security concerns (auth bypass, RLS, PII, injection, webhooks)

## Files to Inspect
- Code files under review
- `middleware.ts` — auth gate
- `prisma/rls-policies.sql` — tenant isolation
- `lib/db/withUserContext.ts` — DB access
- `lib/db/admin.ts` — RLS bypass usage

## Security Review Framework

### Authentication
| Check | Pass Condition |
|---|---|
| Route calls `supabase.auth.getUser()` first | Returns 401 if no user |
| `userId` not from request body | Derived from auth session only |
| Sign-out redirects to `/` | Not to user-supplied URL |
| Cron authenticated with `CRON_SECRET` | Verified before any processing |

### Authorisation (RLS)
| Check | Pass Condition |
|---|---|
| User-facing routes use `withUserContext` | Not `prismaAdmin` |
| `prismaAdmin` only in cron/webhooks/auth-bootstrap | Code comment explains why |
| Feature gates present on tier-restricted routes | `requireFeature` or `hasPlanFeature` check |

### Input Validation
| Check | Pass Condition |
|---|---|
| Zod schema at each route boundary | `safeParse` with error return |
| No raw SQL strings from user input | Prisma parameterised queries only |
| Email template variables sanitized | No HTML injection risk |
| File uploads size-limited | For CSV/file routes |

### Secrets
| Check | Pass Condition |
|---|---|
| No hardcoded secrets | All from `process.env` |
| No `NEXT_PUBLIC_` on server-only secrets | Check env var names |
| No secrets logged | `console.error` doesn't include keys |

### Webhook Security
| Check | Pass Condition |
|---|---|
| Billing webhook verifies `STRIPE_BILLING_WEBHOOK_SECRET` | Before any processing |
| Connect webhook verifies `STRIPE_CONNECT_WEBHOOK_SECRET` | Before any processing |
| Raw body used for signature verification | Not parsed JSON |

### PII Protection
| Check | Pass Condition |
|---|---|
| `clientEmail` not logged | Not in `console.error` |
| `clientName` not in error responses | Not leaked to client |
| Raw DB rows not returned | Mapped to safe shapes |

## OWASP Top 10 Quick Checks

- **A01 Broken Access Control** — auth check + RLS + feature gates
- **A02 Cryptographic** — no hardcoded secrets, webhook signature verification
- **A03 Injection** — Zod validation, Prisma parameterised queries, sanitized templates
- **A05 Misconfiguration** — `LIVE` env, correct `DATABASE_URL`, no dev keys in production
- **A07 Auth Failures** — `getUser()` not `getSession()`, no open redirect
- **A09 Logging** — no PII in logs, auth failures return 401

## Rules to Follow
- Document every `prismaAdmin` usage outside approved files
- Never weaken auth checks for convenience
- Every finding must reference exact file + line
- Suggest the minimum targeted fix

## Common Mistakes to Avoid
- Accepting `userId` from request body
- Using `getSession()` instead of `getUser()`
- Processing webhook events before signature verification
- Logging PII fields

## Output Format
- Findings categorised by severity (P0–P3)
- Each finding: file path, description, recommended fix
- Actionable fix for every P0 finding

## Acceptance Checklist
- [ ] All P0 security issues resolved
- [ ] RLS enforced on all user data queries
- [ ] No hardcoded secrets
- [ ] Webhook signatures verified
- [ ] PII not logged or leaked
