## ADDED Requirements

### Requirement: Atomic Due-Work Dispatch
Celery Beat SHALL run a dispatcher task on a fixed interval between 1 and 5 minutes. On each
run, the dispatcher SHALL atomically claim all due rows (rows whose `next_action_at <= now()`)
across the scheduled workflows it owns — accounting sync, reminder emails, promise-to-pay
follow-ups, weekly debtor summaries, integration retry processing, and reconciliation/stale-job
recovery — and enqueue exactly one Celery task per claimed row onto the Redis-backed queue. The
system SHALL NOT create a static per-invoice Celery Beat schedule entry.

#### Scenario: Dispatcher claims due invoices
- **WHEN** the dispatcher task runs and one or more `TrackedInvoice` rows have
  `next_action_at <= now()`
- **THEN** the dispatcher atomically marks each claimed row so no other dispatcher run can
  claim it again, and enqueues one Celery task per claimed row

#### Scenario: No due work
- **WHEN** the dispatcher task runs and no rows are due
- **THEN** the dispatcher enqueues no tasks and exits without error

### Requirement: Idempotent Task Claiming
Every unit of scheduled work SHALL have a unique claim key derived from the entity and the
scheduled action (for reminder emails: `invoice_id + reminder_stage + scheduled_date`). The
claim key SHALL be enforced as a uniqueness constraint at the database level, so that
attempting to claim or enqueue the same unit of work twice (including from two concurrent
dispatcher/worker processes) is a no-op rather than a duplicate side effect.

#### Scenario: Duplicate claim attempt is rejected
- **WHEN** two dispatcher or worker processes attempt to claim the same `invoice_id +
  reminder_stage + scheduled_date` combination at overlapping times
- **THEN** only one claim succeeds and the other is rejected by the database constraint, with
  no duplicate task enqueued or duplicate reminder sent

### Requirement: Task Status Lifecycle
Every claimed unit of scheduled work SHALL be tracked through the states `queued`, `started`,
`sent` (or an equivalent terminal success state per workflow), `failed`, `retrying`, and
`processing`, persisted in Supabase Postgres. State transitions SHALL be recorded so that the
current state of any in-flight or completed unit of work is queryable independent of Redis or
Celery's own result backend.

#### Scenario: Successful task records terminal status
- **WHEN** a Celery worker completes a task successfully (e.g. a reminder email is sent)
- **THEN** the task's persisted status is updated to its terminal success state and includes
  enough detail to identify what was sent and when

#### Scenario: Failed task is marked failed or retrying
- **WHEN** a Celery worker's task raises an error during processing
- **THEN** the task's persisted status is updated to `failed` or `retrying` (per the retry
  policy for that task type), never left at `started` or `processing`

### Requirement: Automatic Retry with Exponential Backoff
Tasks that call Xero, MYOB, or the email provider (Resend) SHALL automatically retry on
failure using exponential backoff, up to a bounded maximum number of attempts. The system
SHALL NOT require manual intervention or wait for the next dispatcher cycle to retry a
transient provider failure.

#### Scenario: Transient provider failure is retried
- **WHEN** a Xero, MYOB, or Resend API call made by a Celery task fails with a transient error
- **THEN** the task automatically retries with exponential backoff, without requiring a new
  dispatcher claim

#### Scenario: Retry budget exhausted
- **WHEN** a task exhausts its maximum retry attempts without success
- **THEN** the task's persisted status is set to `failed` and the failure is visible for
  operational follow-up, rather than retrying indefinitely

### Requirement: Stale Processing Recovery Sweep
The system SHALL run a recovery sweep that detects units of work left in the `processing`
status for longer than an expected processing window (indicating a worker crash or Redis
disruption) and reclaims them for reprocessing, subject to the same idempotent claim-key
guarantee as normal dispatch.

#### Scenario: Worker crash leaves a task stuck in processing
- **WHEN** a Celery worker crashes while a task's status is `processing` and the task remains
  in that status past the expected processing window
- **THEN** the recovery sweep reclaims the task and re-enqueues it for another attempt, without
  producing a duplicate side effect (per the idempotent claim-key requirement)

### Requirement: Single Celery Beat Instance
Exactly one Celery Beat instance SHALL be running at any time for PaidSoon's scheduled
workflows. The system SHALL NOT run multiple concurrent Beat instances issuing overlapping
dispatch cycles.

#### Scenario: Beat deployment enforces single instance
- **WHEN** the Railway Celery Beat service is deployed or redeployed
- **THEN** at most one Beat instance is active and dispatching at any given time

### Requirement: Supabase as Durable Source of Truth
All durable state for scheduled workflows (claim status, task lifecycle state, `next_action_at`
scheduling fields) SHALL be stored in Supabase Postgres. Redis SHALL be used only as a
transient message broker/queue for Celery and SHALL NOT be relied upon as the durable record
of any business state.

#### Scenario: Redis is flushed or restarted
- **WHEN** Redis is flushed or restarted, losing all in-flight queue messages
- **THEN** the stale-processing recovery sweep is able to reconstruct and reclaim all
  interrupted work using Supabase Postgres alone, with no permanent data loss
