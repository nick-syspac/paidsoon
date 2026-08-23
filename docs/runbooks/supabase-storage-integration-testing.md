# Supabase Storage for integration testing (test-only)

This runbook sets up a private Supabase Storage bucket used only by integration tests.

Scope and constraints:

- This is test harness infrastructure. It is not part of PaidSoon production runtime paths.
- Use existing Supabase project credentials from [README.md](./README.md).
- Keep all access server-side. Do not use browser keys for upload/delete test artifacts.

## 1. Use case

Use this bucket to store temporary integration-test artifacts, for example:

- audit export fixtures
- snapshot JSON payloads
- generated files for API export test assertions

Recommended bucket name:

- `integration-test-artifacts`

Recommended object key pattern:

- `run-<timestamp>/<suite>/<file>`
- Example: `run-2026-08-23T09-30-00Z/audit-log/export-1.json`

## 2. Create the bucket

Dashboard path:

1. Supabase Dashboard -> Storage -> New bucket
2. Name: `integration-test-artifacts`
3. Public bucket: disabled (private bucket)
4. File size limit: set to a practical cap for tests (for example 20 MB)
5. Allowed MIME types: optional; keep broad if tests cover multiple export formats

## 3. Access model

Preferred model for integration tests in this repo:

- Use server-side `SUPABASE_SECRET_KEY` only.
- Perform uploads/downloads/deletes from Node test code or server routes.
- Do not expose storage operations to browser clients.

Why this model:

- Avoids adding public storage policies for test-only flows.
- Keeps cleanup and mutation authority restricted to trusted server context.

## 4. Optional SQL hardening for authenticated test users

If you also need signed-in (non-service) users to read/write test files, create explicit policies for `storage.objects` in this bucket.

```sql
-- Optional: allow authenticated users to list/read only their own test objects
create policy if not exists "it_read_own_objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'integration-test-artifacts'
  and owner = auth.uid()
);

-- Optional: allow authenticated users to insert only their own objects
create policy if not exists "it_insert_own_objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'integration-test-artifacts'
  and owner = auth.uid()
);

-- Optional: allow authenticated users to update only their own objects
create policy if not exists "it_update_own_objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'integration-test-artifacts'
  and owner = auth.uid()
)
with check (
  bucket_id = 'integration-test-artifacts'
  and owner = auth.uid()
);

-- Optional: allow authenticated users to delete only their own objects
create policy if not exists "it_delete_own_objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'integration-test-artifacts'
  and owner = auth.uid()
);
```

Notes:

- Keep bucket private unless there is a strict test requirement for public reads.
- If you use upsert in client flows, ensure insert/select/update permissions are all present.

## 5. Minimal Node test helper pattern

Use the existing project URL and secret key.

```ts
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const BUCKET = "integration-test-artifacts"
const key = `run-${new Date().toISOString().replace(/[:.]/g, "-")}/sample.json`

await supabase.storage.from(BUCKET).upload(
  key,
  JSON.stringify({ ok: true }),
  {
    contentType: "application/json",
    upsert: false,
  },
)

const { data: download } = await supabase.storage.from(BUCKET).download(key)

await supabase.storage.from(BUCKET).remove([key])
```

## 6. Cleanup strategy

Use both per-test cleanup and lifecycle cleanup:

1. Per-test cleanup: each test removes files it created.
2. Scheduled cleanup: remove old `run-*` prefixes (for example older than 7 days).

Suggested lifecycle posture:

- dev project (`paidsoon-dev`): keep short retention (3 to 14 days)
- prod project (`paidsoon-prod`): avoid creating integration-test artifacts; if needed, keep very short retention and isolate by prefix

## 7. Verification checklist

After setup, verify all of the following:

1. Upload works with server credentials.
2. Download works for the same object.
3. Delete works and object is removed.
4. Bucket is private (direct public URL should not return object content).
5. No browser client path has write/delete access for this bucket.

## 8. CI guidance

For CI jobs that run integration tests:

- Reuse existing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` from the target environment.
- Generate a unique run prefix per job to avoid collisions.
- Always run cleanup in a `finally` block.
- Fail fast if upload/delete returns authorization errors.

## 9. Security reminders

- Never place `SUPABASE_SECRET_KEY` in any `NEXT_PUBLIC_*` variable.
- Never log the secret key or signed URLs containing sensitive query tokens.
- Keep test artifacts non-sensitive whenever possible.
- If sensitive payloads must be stored, enforce strict retention and immediate cleanup.

## 10. Fit with current architecture

Current architecture docs state object storage is not part of the production product path. This runbook does not change that.

- Production feature behavior remains DB + API driven.
- This bucket exists only to support integration-test workflows.
