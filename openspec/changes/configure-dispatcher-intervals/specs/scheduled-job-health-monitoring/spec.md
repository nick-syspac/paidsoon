## MODIFIED Requirements

### Requirement: Dispatcher Heartbeat Recording
The Railway Celery Beat dispatcher SHALL record a heartbeat timestamp in Supabase Postgres
each time it completes a heartbeat cycle, on its own independently configurable interval, so
that the health of the Railway scheduling system is independently observable from Vercel.

#### Scenario: Dispatcher records heartbeat on each cycle
- **WHEN** the Celery Beat dispatcher completes a heartbeat cycle
- **THEN** it writes or updates a heartbeat timestamp record in Supabase Postgres reflecting
  the current time

### Requirement: Vercel Watchdog Alerting
An independent Vercel Cron job SHALL run on a low-frequency schedule and alert when the most
recent dispatcher heartbeat is older than a computed threshold, indicating that Railway/Celery
Beat scheduling has stopped. The threshold SHALL be computed as the configured heartbeat
interval multiplied by a configurable multiplier, rather than a fixed constant, so that the
threshold cannot silently drift out of proportion with the actual heartbeat cadence. This
watchdog SHALL be independent of the Railway Celery system it monitors — it MUST NOT depend on
Railway being reachable to detect and report an outage. On the Vercel Hobby plan, the maximum
schedulable frequency is once daily; a sub-daily schedule (e.g. every 15–30 minutes) SHALL be
used instead once the project is on a Vercel plan that supports it.

#### Scenario: Heartbeat is current
- **WHEN** the watchdog cron runs and the most recent dispatcher heartbeat is within the
  computed threshold
- **THEN** the watchdog takes no action

#### Scenario: Heartbeat is stale
- **WHEN** the watchdog cron runs and the most recent dispatcher heartbeat is older than the
  computed threshold
- **THEN** the watchdog raises an alert indicating that Railway scheduling appears to have
  stopped

#### Scenario: No heartbeat has ever been recorded
- **WHEN** the watchdog cron runs and no dispatcher heartbeat record exists at all
- **THEN** the watchdog treats this the same as a stale heartbeat and raises an alert

#### Scenario: Threshold tracks a changed heartbeat interval
- **WHEN** the configured heartbeat interval is changed in both the Railway worker and the
  Vercel project
- **THEN** the watchdog's computed staleness threshold changes proportionally, without any code
  change
