# CommitGuard settings — task 7.6 verification

Date: 2026-10-19. Local implementation evidence only; not a deployment claim.

## Scope

Only task 7.6 of `fix-commitguard-cash-protection-workflows` was implemented in
this session. Task checkboxes remain unchanged at the owner's request (41/54
recorded complete). Tasks 7.7, 7.8 and section 8 remain pending. No schema,
SQL, shared database, scheduler, billing, email delivery or CashPlan assembler
changes were made.

## Controls and contracts

- The actual settings renderer exposes enablement, selected default horizon,
  buffer weeks, exact two-decimal fixed amounts and independent fixed currency.
- Weekly amount, currency and UTC date remain in the existing owner-input form.
  Settings link directly to it; policy changes never renew its date, relabel its
  currency or export those financial inputs. Missing weeks/percent stay empty.
- Warning text is independent local draft state. Typing a trailing comma and
  clearing the input do not normalize, round, remove tokens or restore defaults.
  Save accepts 1–12 integer day entries, each 1–365; valid text is deduplicated
  and sorted descending only at save. Empty lists are rejected, including API
  and transfer writes. Omission remains a partial-policy no-op. Alert preferences,
  not empty lists, disable categories. Legacy stored-list read compatibility is
  unchanged.
- Settings save sends only edited policy keys. New server settings update
  untouched controls without erasing dirty fields or warning drafts. Server
  validation errors retain drafts. Successful saves retain the existing coherent
  workspace GET plus server-refresh flow; retry after refresh failure is GET only.
- Detection minimum remains 2–10. The legacy `confirmed` threshold remains
  visibly review-required; generated thresholds remain low/medium/high.
- Disabled summary assertions are unavailable. Existing adapter contribution
  fields publish no occurrences, currency groups, protection or outflow amounts.
  Source cash, commitments and history remain retained. This external adapter is
  not proof of active CashPlan forecast assembly (section 8 remains pending).

## Automated verification

- `npm run test`: **3,845 passed, 0 failed, 0 skipped**, 311 suites.
- `npm run lint`: **0 errors, 1 existing warning** (`lib/settings/navigation.ts`,
  unused `isVisible`).
- `npx tsc --noEmit --pretty false`: **48 unrelated existing diagnostics**;
  none in the task-7.6 edited files. Includes generated development route types
  and existing unrelated test fixtures; not represented as a clean typecheck.
- `git diff --check`: passed.
- `openspec validate fix-commitguard-cash-protection-workflows --type change --strict`:
  passed.

Regression coverage uses the real settings schema, authenticated settings route,
atomic settings service, cash mapper, summary/adapter, detector and internal job
route with offline storage/access doubles. Tests verify invalid list writes stop
before storage; partial imports preserve omitted keys; four weeks at 20000 cents
produces 80000 cents; a selected 60-day horizon protects two monthly occurrences
while the labeled 30-day metric includes one; disable suppresses summary/adapter,
detection and evaluation; a post-claim disable prevents financial side effects;
and re-enable uses a new evaluation revision and retained source records.

## Actual-component browser evidence

The synthetic workspace harness bundles the production React components and
actual Tailwind CSS, strict policy/import schemas, summary and cash freshness
mapper. Browser transport uses memory only. Next navigation is a recorded stub
that supplies refreshed server props, not authenticated Next/RSC or live DB proof.

Verified using browser interactions:

1. Typed `30` followed by a comma: draft remained `30,`. Clearing remained empty.
   Empty and fractional-token saves showed inline errors with **zero writes**.
2. Valid `30,7` saved only `renewalWarningDays`, then performed workspace GET and
   requested server refresh. Injected server field errors preserved `14,7` and
   the prior persisted list.
3. Partial import updated horizon/weeks/fixed currency and exact 123.45 amount,
   retaining a trailing-comma draft. Empty warning drafts likewise survived a
   partial import. A subsequent warning-only save did not overwrite imported keys.
4. Saved four weeks with initially missing expenses: missing, not zero. Saved a
   dated AUD 200.00 weekly basis through its separate form: fresh 80000-cent
   buffer, 60-day protection and all refreshed figures agreed.
5. Disable made free cash/protection/status unavailable and Detect unavailable;
   records and cash context were unchanged. Re-enable restored prior amounts.
6. Successful settings save with failed workspace GET showed saved/stale wording;
   retry increased GET count from 6 to 7 while writes stayed at 5, and displayed
   the committed 90-day horizon.
7. Changed cash AUD to USD: weekly currency remained AUD and its date was
   unchanged; free cash reported currency mismatch rather than relabeling.
8. At 375px viewport width the settings form had 336px rendered/scroll width,
   with no settings-form horizontal overflow.

No external database/API calls, real emails or scheduler activation were used.
Production build, live authenticated acceptance and deployment checks were not
part of this task.