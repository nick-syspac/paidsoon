## ADDED Requirements

### Requirement: Log token usage after every successful AI rewrite call
The system SHALL write a record to `ai_usage_logs` after every successful call to `POST /api/settings/ai`. The record SHALL include the authenticated user ID, model name, prompt token count, completion token count, total token count, estimated cost in USD, and the feature name (`ai_rewrite`).

#### Scenario: Usage record created on success
- **WHEN** an AI rewrite call completes successfully and returns HTTP 200
- **THEN** one row is inserted into `ai_usage_logs` with the correct `userId`, `model`, `promptTokens`, `completionTokens`, `totalTokens`, `estimatedCostUsd`, and `feature` values

#### Scenario: Usage record not created on error
- **WHEN** the OpenAI call fails or the route returns a non-200 response
- **THEN** no row is inserted into `ai_usage_logs`

#### Scenario: Usage record not created for ineligible user
- **WHEN** the request is rejected at the feature gate (HTTP 403)
- **THEN** no row is inserted into `ai_usage_logs`

### Requirement: Users may read their own usage logs
The database SHALL enforce row-level security such that a user can only SELECT rows from `ai_usage_logs` where `user_id` matches their own authenticated user ID.

#### Scenario: User reads own rows
- **WHEN** a query is made against `ai_usage_logs` within a `withUserContext` transaction for user A
- **THEN** only rows belonging to user A are returned

#### Scenario: User cannot read another user's rows
- **WHEN** a query is made against `ai_usage_logs` within a `withUserContext` transaction for user A
- **THEN** rows belonging to user B are not returned

### Requirement: Only service role may insert usage logs
The RLS policy on `ai_usage_logs` SHALL NOT grant INSERT to authenticated users. All inserts SHALL be performed by the application via `prismaAdmin` (service role).

#### Scenario: Insert via service role succeeds
- **WHEN** `prismaAdmin` inserts a row into `ai_usage_logs`
- **THEN** the insert succeeds

#### Scenario: Insert via user role rejected
- **WHEN** an insert is attempted on `ai_usage_logs` within a `withUserContext` transaction (authenticated user role)
- **THEN** the insert is rejected by RLS

### Requirement: Estimated cost stored in USD as decimal
The `estimatedCostUsd` field SHALL store the estimated OpenAI API cost in US dollars as a `NUMERIC(12, 8)` (Prisma `Decimal`) value. The calculation SHALL use the model's published per-token pricing at the time of implementation. No currency conversion SHALL be applied at write time.

#### Scenario: Cost calculated from token counts
- **WHEN** a successful call returns `usage.promptTokens` and `usage.completionTokens`
- **THEN** `estimatedCostUsd` is set to `(promptTokens × inputRatePerToken) + (completionTokens × outputRatePerToken)` rounded to 8 decimal places
