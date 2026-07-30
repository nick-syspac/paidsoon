## ADDED Requirements

### Requirement: Job queue and worker state are visible
The system MUST allow admins to view queued jobs, running jobs, failed jobs, completed jobs, retry count, job type, affected tenant, error message, worker status, queue depth, and dead-letter queue.

#### Scenario: Worker status is visible
- **WHEN** an admin opens the job queue view
- **THEN** worker state and queue depth are shown

### Requirement: Job queue actions are controlled
Admins SHOULD be able to retry jobs, cancel jobs, requeue jobs, mark jobs ignored, trigger invoice sync jobs, trigger reminder scheduler jobs, trigger email retry jobs, and clear stuck jobs after confirmation. These actions MUST be audited.

#### Scenario: Retry is available for a failed job
- **WHEN** a job has failed and can be retried safely
- **THEN** the admin can retry it from the UI

#### Scenario: Clear stuck job requires confirmation
- **WHEN** an admin clears a stuck job
- **THEN** the action requires confirmation and is logged
