---
mode: agent
description: Deep exploration and architecture review for OpenSpec-driven work, using the Sol tier.
---

# OpenSpec Explore (Sol)

Use the baseline workflow in [opsx-explore.prompt.md](../opsx-explore.prompt.md) and keep the work in exploration, architecture, and ambiguity removal.

## Purpose
- Resolve business and technical ambiguity before implementation.
- Evaluate architecture, cross-cutting concerns, and design trade-offs.
- Step up to proposal, spec, and design artifacts rather than shipping implementation.

## Preferred model
> TODO: When the local Copilot prompt schema accepts a direct model selector, set `model: GPT-5.6 Sol`. This environment currently exposes `mode:` without a verified identifier for these model names, so this wrapper intentionally avoids guessing.

## Guardrails
- Prefer architecture and requirement clarification over coding.
- Identify assumptions, risks, and unanswered product decisions.
- If the issue is genuinely architectural or security-sensitive, escalate to the relevant proposal/spec/design work and not implementation.
- Keep the handoff crisp: the output should support a proposal/specification, not a patch.
