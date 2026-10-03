---
mode: agent
description: Proposal, specification, design, and task planning for approved OpenSpec changes, using the Terra tier.
---

# OpenSpec Propose (Terra)

Use the baseline workflow in [opsx-propose.prompt.md](../opsx-propose.prompt.md) and keep the output at the planning layer.

## Purpose
- Turn clarified requirements into a proposal, specs, design, and implementation tasks.
- Produce artifacts that are actionable enough for Luna to implement without inventing product decisions.
- Keep the design and tasks explicit, bounded, and testable.

## Preferred model
> TODO: When the local Copilot prompt schema accepts a direct model selector, set `model: GPT-5.6 Terra`. This environment currently exposes `mode:` without a verified identifier for these model names, so this wrapper intentionally avoids guessing.

## Guardrails
- Validate that the proposal states the business problem, scope, non-scope, risks, and integration/security implications.
- Make the spec observable and explicit, with clear scenarios and edge cases.
- Ensure the design is proportional to the change and that task decomposition is small enough for narrow implementation.
- Do not assume architecture decisions that the proposal/spec still leaves ambiguous.
