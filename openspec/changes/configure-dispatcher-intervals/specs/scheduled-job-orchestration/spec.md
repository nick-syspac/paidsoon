## MODIFIED Requirements

### Requirement: Atomic Due-Work Dispatch
Celery Beat SHALL run one dispatcher task per scheduled workflow — accounting sync, reminder
emails, promise-to-pay follow-ups (catchup/snooze sweep), promise/arrangement breach sweep, and
reconciliation/stale-job recovery — each on its own independently configurable interval between
1 and 5 minutes. A separate Beat entry SHALL record a heartbeat on a single, independently
configurable interval that is NOT tied to any individual workflow's dispatch cadence. On each
dispatcher run, the dispatcher SHALL atomically claim all due rows (rows whose
`next_action_at <= now()`) for that workflow and enqueue exactly one Celery task per claimed row
onto the Redis-backed queue. The system SHALL NOT create a static per-invoice Celery Beat
schedule entry.

#### Scenario: Dispatcher claims due invoices
- **WHEN** a dispatcher task runs and one or more `TrackedInvoice` rows have
  `next_action_at <= now()`
- **THEN** the dispatcher atomically marks each claimed row so no other dispatcher run can
  claim it again, and enqueues one Celery task per claimed row

#### Scenario: No due work
- **WHEN** a dispatcher task runs and no rows are due
- **THEN** the dispatcher enqueues no tasks and exits without error

#### Scenario: Workflows run on independently configured intervals
- **WHEN** the accounting-sync dispatch interval is configured to a different value than the
  reminder-email dispatch interval
- **THEN** each dispatcher task runs on its own configured cadence, and neither interval affects
  the other

#### Scenario: Heartbeat cadence is independent of workflow dispatch cadences
- **WHEN** any individual workflow's dispatch interval is changed
- **THEN** the heartbeat recording cadence is unaffected, since it is controlled by its own
  separate configuration value

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
