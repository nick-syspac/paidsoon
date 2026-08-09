## 1. OpenSpec and Capability Scaffolding

- [x] 1.1 Finalize capability list and create spec files for training studio authoring, lifecycle, audience visibility, destination links, DB search, and MDX import.
- [x] 1.2 Validate proposal/design/spec language consistency for workflow (`draft -> review -> published`) and audience (`public`, `signed_in`).

## 2. Data Model and Migration

- [x] 2.1 Add Prisma models for DB-first training content and revision history.
- [x] 2.2 Add enum/constraint representation for lifecycle states (`draft`, `review`, `published`).
- [x] 2.3 Add enum/constraint representation for audience (`public`, `signed_in`).
- [x] 2.4 Add metadata support for destination-key references and revision restore lineage.
- [ ] 2.5 Create and apply Prisma migration for new models.
- [x] 2.6 Update RLS policies and access strategy for admin-authored platform content.
- [ ] 2.7 Run `npm run verify-rls` after policy changes.
- [x] 2.8 Generate and apply follow-up Prisma migration that adds `training_content_created`, `training_content_updated`, `training_submitted_for_review`, `training_published`, and `training_restored` to PostgreSQL enum `AdminAuditAction`.

## 3. Admin Authoring API

- [x] 3.1 Add protected admin API route(s) for creating new draft guides.
- [x] 3.2 Add protected admin API route(s) for updating draft content metadata and body.
- [x] 3.3 Add protected admin API route(s) for transitioning state draft -> review.
- [x] 3.4 Add protected admin API route(s) for transitioning state review -> published.
- [x] 3.5 Add protected admin API route(s) for listing revision history.
- [x] 3.6 Add protected admin API route(s) for restore-as-new-revision.
- [x] 3.7 Add strict Zod validation at route boundaries for all authoring payloads.

## 4. Admin Authorization and Auditability

- [x] 4.1 Enforce internal staff role checks on all training studio APIs.
- [x] 4.2 Restrict publish and restore actions to approved admin role levels.
- [x] 4.3 Log lifecycle transitions and revision restore actions to admin audit events.
- [x] 4.4 Add tests for role boundaries and forbidden transitions.

## 5. Training Studio UI (Admin)

- [x] 5.1 Add protected admin route for training library list/filter by lifecycle state.
- [x] 5.2 Add guide editor route for create/edit with structured blocks.
- [x] 5.3 Add review submission UI and state badges.
- [x] 5.4 Add publish UI with audience selection and confirmation.
- [x] 5.5 Add revision history panel and restore action flow.
- [x] 5.6 Add preview mode that renders as customer-facing output.

## 6. Destination-Key Link Resolver

- [x] 6.1 Define destination key registry contract (key, label, route, audience/access constraints).
- [x] 6.2 Implement runtime resolver from destination key to navigable route.
- [x] 6.3 Add fallback behavior for unresolved/unavailable destination keys to top-level help topic.
- [x] 6.4 Add automated tests for valid resolution, denied resolution, and fallback behavior.

## 7. Reader Delivery (Public and Signed-In)

- [x] 7.1 Add DB-backed read route(s) for published content by slug.
- [x] 7.2 Enforce audience visibility checks server-side for every read request.
- [x] 7.3 Keep existing help URL structure stable through cutover.
- [x] 7.4 Add redirect/compat handling where legacy links require translation.

## 8. DB-Backed Search Path

- [x] 8.1 Add search index strategy for title, summary, and body text.
- [x] 8.2 Add DB-backed search API endpoint for help/training content.
- [x] 8.3 Enforce audience visibility filtering in search responses.
- [x] 8.4 Update help search UI integration to call the DB-backed endpoint.
- [x] 8.5 Add relevance and access tests (public vs signed_in visibility).

## 9. One-Time MDX Import

- [x] 9.1 Build import script that reads current files under `content/help`.
- [x] 9.2 Parse frontmatter and map to DB content fields (title, description, slug, body).
- [x] 9.3 Convert MDX body into accepted stored content format, flagging unsupported constructs.
- [x] 9.4 Assign initial audience values per migration plan defaults.
- [x] 9.5 Run dry-run mode with parse and mapping report output.
- [ ] 9.6 Execute one-time import and capture import audit summary.
- [ ] 9.7 Validate slug continuity and link integrity after import.

## 10. Cutover and Cleanup

- [x] 10.1 Switch help read/search paths from MDX source pipeline to DB-backed services.
- [x] 10.2 Verify unresolved destination link fallback routes to top-level help topic.
- [ ] 10.3 Freeze and retire MDX files as source-of-truth after successful cutover.
- [x] 10.4 Keep rollback plan ready (read from legacy source if critical issues emerge).

## 11. Testing and Verification

- [x] 11.1 Add tests for lifecycle transitions and invalid state changes.
- [x] 11.2 Add tests for revision immutability and restore-as-new-revision behavior.
- [x] 11.3 Add tests for audience-gated content read and search.
- [x] 11.4 Add tests for destination-key resolver and fallback redirects.
- [x] 11.5 Add migration verification checks for imported records and rendering fidelity.
- [x] 11.6 Run `npm run lint`, `npx tsc --noEmit`, and `npm run test`.

## 12. Documentation Updates

- [x] 12.1 Update DDD with new training content models and lifecycle semantics after implementation.
- [x] 12.2 Update DDD API route table with training studio/admin and reader/search endpoints.
- [x] 12.3 Update runbooks with migration/cutover operational steps and rollback guidance.
- [x] 12.4 Document destination-key governance and fallback policy.
