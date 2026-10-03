---
mode: agent
description: Independent verification against OpenSpec artifacts, using the Terra tier.
---

# OpenSpec Verify (Terra)

Use the baseline workflow in [opsx-apply.prompt.md](../opsx-apply.prompt.md) and review the actual implementation as if the author were not the reviewer.

## Purpose
- Verify that implementation satisfies the applicable proposal/spec/design/tasks.
- Check code quality, risk, regression exposure, and test coverage without assuming implementation is correct.
- Produce findings grouped as CRITICAL, HIGH, MEDIUM, LOW, and PASS.

## Preferred model
> TODO: When the local Copilot prompt schema accepts a direct model selector, set `model: GPT-5.6 Terra`. This environment currently exposes `mode:` without a verified identifier for these model names, so this wrapper intentionally avoids guessing.

## Guardrails
- Verify implementation against the actual OpenSpec artifacts, not a memory of the plan.
- Check behaviour, tests, security boundaries, migrations, and operational concerns.
- Report spec-compliance gaps explicitly and do not mark a change ready for archive while CRITICAL or HIGH specification-compliance issues remain.
- Escalate architecture verification questions to the Sol review path when the problem is design-level rather than implementation-level.
