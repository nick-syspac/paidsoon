## Why

PaidSoon already has a public Help Centre backed by MDX files and a separate admin surface for operational workflows. This split makes instructional content hard to evolve quickly, hard to govern with review/publishing controls, and disconnected from contextual in-product help.

The business now needs a dedicated Training Studio operated by internal staff in admin, with structured authoring, revision history, and controlled publishing. The target architecture is database-first content (Option A), so one content system can power public overviews, signed-in product help, and future training surfaces.

## What Changes

- **NEW**: Admin Training Studio under `/admin` for internal staff authoring.
- **NEW**: Database-first training/help content domain with lifecycle workflow `draft -> review -> published`.
- **NEW**: Mixed audience visibility model for published content (`public` and `signed_in`).
- **NEW**: Revision system with immutable history and restore-by-new-revision semantics.
- **NEW**: Destination-key link abstraction for PaidSoon route links inside authored content.
- **NEW**: Fallback behavior for unresolved destination keys: redirect to top-level help topic.
- **NEW**: DB-backed search path for published training/help content.
- **NEW**: One-time import from existing MDX Help Centre files in `content/help`.
- **NEW**: Follow-up generated Prisma migration to add missing training lifecycle audit actions to the existing `AdminAuditAction` PostgreSQL enum.
- **MODIFIED**: Help content delivery pipeline migrates from MDX source-of-truth to DB source-of-truth.

## Capabilities

### New Capabilities

- `training-studio-authoring`
  - Internal staff can create and edit guides in an admin-only authoring surface.
  - Authoring supports structured training-oriented blocks (not generic WYSIWYG-only flows).

- `training-content-lifecycle`
  - Guides progress through `draft`, `review`, and `published` states.
  - Only `published` content is visible in customer/help surfaces.

- `training-audience-visibility`
  - Published guides are visible by audience.
  - Initial audiences: `public` and `signed_in`.

- `training-revisions`
  - Every publish operation creates an immutable revision snapshot.
  - Restores create a new revision; history is append-only.

- `training-destination-links`
  - Content stores stable destination keys instead of raw routes.
  - Runtime resolver maps keys to routes and enforces visibility/access checks.
  - Unresolvable or unavailable keys redirect users to top-level help topic.

- `training-search-db`
  - Search API queries DB-backed published guides.
  - Search results are filtered by audience visibility.

- `help-mdx-one-time-import`
  - Existing Help Centre MDX documents are imported one time into the new DB model.
  - Imported content preserves title, description, and slug continuity where possible.

### Modified Capabilities

- `help-centre-content-delivery`
  - Changes from file-based MDX source to DB-backed content source.
  - Existing help routes remain stable during migration and cutover.

## Scope Decisions (Locked)

- **Publication topology**: Option A (DB-first canonical source).
- **Authorization model**: Admin-authored platform content by internal staff operators.
- **Workflow**: `draft`, `review`, `publish`.
- **Audience model**: Mixed public/private by audience (`public` and `signed_in` at launch).
- **Fallback behavior**: Redirect unresolved destination links to top-level help topic.
- **Migration approach**: One-time import of current `content/help` MDX corpus.

## Impact

- **Data model**: New training/help content and revision tables, plus destination-key linkage metadata.
- **Admin UI**: New Training Studio pages in protected admin routes.
- **API**: New admin authoring/review/publish endpoints and public/signed-in read/search endpoints.
- **Search**: Existing file-source search endpoint is superseded by a DB search path.
- **Routing**: PaidSoon destination key resolver is introduced for in-content product navigation.
- **Operations**: One-time import tooling from `content/help` is required for initial migration.
- **Auditability**: Authoring/review/publish actions should be captured in admin audit events.
- **Migration Integrity**: Prisma schema enum updates must be matched by generated SQL enum migrations to prevent runtime audit insert rejection.

## Out of Scope

- LMS features such as courses, modules, quizzes, certifications, and progress tracking.
- Tenant-authored training content.
- Multi-locale content authoring and translation workflows.
- AI-generated content authoring automation.
- Real-time collaborative editing.

## Security and Access Considerations

- Training Studio authoring is restricted to internal admin staff with elevated admin access.
- Audience checks must be enforced at content-read and search endpoints, not just in UI.
- Destination-key resolution must not expose admin-only or unavailable routes to public users.
- Audit logging should include who changed what state (`draft/review/published`) and when.

## Risks

- **Migration risk**: MDX-to-DB import may lose formatting fidelity for custom MDX components.
- **Search parity risk**: DB search relevance and UX may differ from current file-source search.
- **Access-control risk**: Misconfigured audience filters could expose signed-in-only help publicly.
- **Link integrity risk**: Destination-key registry drift could create fallback-heavy experiences.
- **Operational risk**: Concurrent updates without clear revision semantics can cause editor confusion.

## Rollout Plan

1. Define schema and API contracts for training content, revisions, audiences, and destination keys.
2. Build admin Training Studio MVP with Draft/Review/Publish workflow.
3. Implement DB-backed read/search routes with audience enforcement.
4. Build and run one-time import from `content/help` MDX into DB.
5. Run validation pass for slug continuity, rendering parity, and audience policy correctness.
6. Switch help surfaces to DB-backed content and search path.
7. Retire MDX help source-of-truth after cutover verification.

## Acceptance Criteria

- Internal staff can author, review, and publish guides from admin.
- Published guides are correctly visible by audience (`public` vs `signed_in`).
- Unresolved destination links redirect to top-level help topic.
- Revision history is immutable; restore operations create new revisions.
- Help/search surfaces read from DB-backed published content.
- Existing `content/help` guides are imported one time with stable slugs and usable formatting.
- Training lifecycle audit actions are accepted by both generated Prisma client and PostgreSQL enum at runtime.
