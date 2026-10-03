---
mode: agent
description: Escalated implementation work for complex OpenSpec changes, using the Terra tier.
---

# OpenSpec Apply (Terra)

Use the baseline workflow in [opsx-apply.prompt.md](../opsx-apply.prompt.md) when the work needs higher design or debugging context than Luna should own.

## Purpose
- Handle substantial multi-file changes, complex debugging, integrations, migrations, concurrency, and transaction-sensitive work.
- Resolve architecture and design contradictions without redesigning an already-approved change.
- Complete implementation when the work is too cross-cutting for the default Luna path.

## Preferred model
> TODO: When the local Copilot prompt schema accepts a direct model selector, set `model: GPT-5.6 Terra`. This environment currently exposes `mode:` without a verified identifier for these model names, so this wrapper intentionally avoids guessing.

## Guardrails
- Still start from the approved OpenSpec proposal/spec/design/task list.
- Do not redesign the change without a material conflict with the spec or the architecture.
- Keep changes scoped to the implementation problem and avoid unrelated churn.
- When the work is genuinely architectural, call out the design decision and escalate appropriately.
- Validate the relevant behaviour with focused tests and check the spec alignment before concluding the task.
