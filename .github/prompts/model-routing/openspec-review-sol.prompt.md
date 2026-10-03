---
mode: agent
description: Architecture and escalation review for issues that require deeper system-level reasoning, using the Sol tier.
---

# OpenSpec Review (Sol)

Use this wrapper only when the issue genuinely requires architectural reasoning beyond the standard Terra review path.

## Purpose
- Re-evaluate the design when the system architecture itself is in question.
- Resolve high-impact migration, security, and tenant-isolation trade-offs.
- Judge whether the OpenSpec design should be revised rather than patched.

## Preferred model
> TODO: When the local Copilot prompt schema accepts a direct model selector, set `model: GPT-5.6 Sol`. This environment currently exposes `mode:` without a verified identifier for these model names, so this wrapper intentionally avoids guessing.

## Guardrails
- Use this only for design-level escalation, not routine implementation or normal verification.
- Compare the current architecture with the approved OpenSpec design and identify where assumptions have drifted.
- Make the architectural decision explicit, including the trade-offs and the implied follow-on changes.
- If the issue is still implementation-level, prefer Terra and keep the review focused.
