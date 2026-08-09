## Context

PaidSoon currently serves Help Centre content from file-based MDX under `content/help`, loaded through the Fumadocs source pipeline. Internal staff cannot author, review, and publish this content from admin, and there is no workflow state, revision history, or audience-aware publication model for mixed public/private instructional content.

The product direction is to introduce a Training Studio operated by internal staff. This requires a DB-first content system (Option A), explicit lifecycle states, audience targeting, stable in-content links to PaidSoon product destinations, and a DB-backed search path.

Key constraints from existing architecture:
- Admin access uses elevated guard layers and platform roles.
- Customer-facing app routes and admin routes evolve over time, so hardcoded route URLs in authored content are brittle.
- Existing help URLs should remain stable through migration.

## Goals / Non-Goals

### Goals

- Establish a DB-first canonical source for help/training content.
- Provide internal-staff authoring in admin with workflow states: draft, review, published.
- Support mixed published visibility by audience: public and signed_in.
- Provide immutable revisions with restore-by-new-revision behavior.
- Replace file-source help search with a DB-backed search path.
- One-time import existing MDX help content from `content/help`.
- Keep route continuity and safe fallback behavior for unresolved in-content destination links.

### Non-Goals

- No LMS-level features (courses, quizzes, completion tracking, certificates).
- No tenant-authored content model.
- No real-time collaborative editing.
- No AI-generated content workflows in this change.
- No localization/translation system in this change.

## Decisions

### 1. Canonical Publication Topology: DB-First (Option A)

Decision:
Training/help content source-of-truth moves from MDX files to database entities.

Rationale:
- Enables lifecycle workflow and revision metadata impossible with static file serving alone.
- Enables audience-aware publication and query-time filtering.
- Enables admin authoring without code changes.

Trade-offs:
- Requires migration and new search indexing path.
- Introduces persistence and API complexity compared to static files.

### 2. Authorization Model: Internal Staff Admin Authoring

Decision:
Training Studio lives under protected admin routes. Authoring actions are limited to internal staff roles.

Rationale:
- Matches current operational model where content stewardship is an internal function.
- Reuses existing admin guard and audit posture.

Role baseline at launch:
- platform_owner: full control.
- platform_admin: create/edit/review/publish.
- platform_support: read-only in studio by default (or no access) unless explicitly expanded.

### 3. Content Lifecycle: Draft -> Review -> Published

Decision:
Content progresses through three explicit states. Published content is the only customer-visible state.

State semantics:
- draft: editable working version.
- review: candidate awaiting approval.
- published: live visible revision for selected audience.

Rationale:
- Prevents accidental publication from in-progress edits.
- Supports clear editorial ownership and handoff.

### 4. Audience Visibility: Mixed Public/Private by Audience

Decision:
Each published guide has audience classification at launch:
- public
- signed_in

Rationale:
- Supports public overviews and gated in-product help in one system.
- Avoids maintaining separate content stacks for public and signed-in users.

Enforcement rule:
Audience filtering is applied server-side in read/search endpoints, not only in UI.

### 5. Revision Semantics: Immutable History with Append-Only Restore

Decision:
Revisions are immutable snapshots. Restore never mutates old revision rows; it creates a new revision referencing the restored source.

Rationale:
- Preserves auditability and editorial traceability.
- Avoids hidden history rewrites.

Required metadata per revision:
- content id
- revision number
- actor user id
- lifecycle state at snapshot time
- change note
- created timestamp

### 6. PaidSoon Link Abstraction: Destination Keys + Resolver Registry

Decision:
Authored content stores destination keys, not raw route URLs.
A server-side resolver registry maps keys to routes and access constraints.

Rationale:
- Prevents mass content breakage when route paths change.
- Allows access-aware link behavior by audience and auth state.

Fallback rule:
If a destination key is unknown or unavailable to the current viewer, route to top-level help topic.

### 7. Help Fallback Behavior

Decision:
Unresolved destination links redirect to top-level help topic.

Rationale:
- Keeps readers in a safe instructional context.
- Avoids hard 404 dead ends from stale links.

### 8. Search Architecture: DB-Backed Help Search Path

Decision:
Introduce a new search API over published DB content with audience filtering.

Initial search scope:
- title
- summary
- rendered/plaintext body extract
- optional feature/topic tags

Rationale:
- Replaces source-file search dependency.
- Aligns search results with published, audience-visible content only.

### 9. One-Time MDX Import Strategy

Decision:
Perform a one-time import from current help MDX corpus in `content/help`.
Imported records become initial DB content entries with preserved slugs where possible.

Migration safeguards:
- Dry run report (counts, parse failures, unsupported MDX components).
- Validation pass for slug collisions and link integrity.
- Manual review queue for component-rich pages that do not map cleanly.

### 10. Admin Audit Enum Migration Parity

Decision:
Whenever new admin audit actions are added to `AdminAuditAction` in the Prisma schema, a generated migration must add matching values to the existing PostgreSQL enum in the same delivery window.

Rationale:
- Prevents runtime drift where generated Prisma types accept action literals that the database rejects.
- Preserves audit completeness for lifecycle actions (`training_content_created`, `training_content_updated`, `training_submitted_for_review`, `training_published`, `training_restored`).

Enforcement rule:
- Migration verification must include an explicit check that SQL contains `ALTER TYPE "AdminAuditAction" ADD VALUE ...` statements for every newly introduced action.

## Data Model Outline

Planned logical entities (names indicative):

- training_content
  - id
  - slug
  - title
  - summary
  - content_json
  - lifecycle_state
  - audience
  - feature_key (optional)
  - created_by
  - updated_by
  - published_at
  - created_at
  - updated_at

- training_revision
  - id
  - training_content_id
  - revision_number
  - snapshot_json
  - snapshot_state
  - change_note
  - actor_user_id
  - restored_from_revision_id (nullable)
  - created_at

- training_destination_usage (optional supporting table)
  - id
  - training_content_id
  - destination_key
  - last_validated_at
  - validation_status

Notes:
- Final schema naming aligns with Prisma and existing conventions during implementation.
- Revision numbering should be monotonic per content item.

## API Surface Outline

Admin authoring APIs (protected):
- create draft content
- update draft content
- submit for review
- publish reviewed content
- list revisions
- restore revision
- list content by state/audience

Reader/search APIs:
- fetch published content by slug (audience enforced)
- search published content (audience enforced)
- resolve destination key to route with fallback behavior

## Security Considerations

- Admin authoring actions require elevated admin guard.
- Publish and restore actions should require higher privileges than draft edits if needed.
- All lifecycle transitions and revision actions should be audit logged.
- Audience checks are server-enforced on read and search APIs.
- Destination resolution must not expose admin-only routes to public or signed-in non-admin users.

## Migration Plan

1. Add schema/models and migration.
2. Build admin authoring workflow endpoints and UI shell.
3. Implement revision capture and restore semantics.
4. Implement destination-key resolver and fallback routing.
5. Implement DB search API and audience filtering.
6. Build one-time MDX import script for `content/help`.
7. Validate import outputs (slug continuity, content fidelity, audience assignment).
8. Cut over help read/search paths to DB-backed endpoints.
9. Retire MDX help source-of-truth after verification.

## Risks / Trade-offs

- MDX component fidelity loss during import (especially custom callouts/components).
- Audience misconfiguration can lead to overexposure or underexposure of content.
- Search relevance may initially regress versus file-source behavior until ranking is tuned.
- Destination registry drift can increase fallback redirects if governance is weak.
- Editorial workflow friction if role permissions are too strict or unclear.

## Open Questions

- Should review-to-publish require a different actor from draft author in V1?
- Should signed_in audience include all authenticated users, including admin accounts by default?
- Should fallback redirect preserve original article context via query params for diagnostics?
- Should imported content default to signed_in unless explicitly marked public?
