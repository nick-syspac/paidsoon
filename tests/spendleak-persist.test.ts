import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { describe, test } from "node:test"

import { upsertSpendFindings } from "@/lib/spendleak/persist"
import type { SpendFinding } from "@/lib/spendleak/engine"

type StoredFinding = {
  id: string
  state: string
  reviewAction: string | null
  evidenceFingerprint: string | null
  evidence: Record<string, unknown>
}

function makeFinding(evidence: Record<string, unknown>): SpendFinding {
  return {
    id: "f-1",
    findingType: "duplicate_payment",
    subjectKey: "supplier:acme",
    severity: "high",
    summary: "Potential duplicate payment",
    state: "open",
    evidence,
    detectedAt: new Date("2026-09-01T00:00:00.000Z"),
    estimatedMonthlyCents: 10000,
    estimatedAnnualCents: 120000,
  }
}

function fingerprintForTest(finding: SpendFinding): string {
  const payload = {
    findingType: finding.findingType,
    subjectKey: finding.subjectKey,
    severity: finding.severity,
    summary: finding.summary,
    estimatedMonthlyCents: finding.estimatedMonthlyCents ?? null,
    estimatedAnnualCents: finding.estimatedAnnualCents ?? null,
    evidence: finding.evidence,
  }

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

describe("upsertSpendFindings suppression behavior", () => {
  test("preserves keep decision for unchanged evidence", async () => {
    const createdOrUpdated: Array<{ data: Record<string, unknown> }> = []
    const detectedFinding = makeFinding({ supplier: "Acme", amountCents: 10000 })
    const store: StoredFinding = {
      id: "existing-1",
      state: "dismissed",
      reviewAction: "keep",
      evidenceFingerprint: fingerprintForTest(detectedFinding),
      evidence: { supplier: "Acme", amountCents: 10000 },
    }

    const delegate = {
      findUnique: async () => ({ ...store }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdOrUpdated.push({ data })
        return { id: "created" }
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        createdOrUpdated.push({ data })
        return { id: store.id }
      },
    }

    await upsertSpendFindings({
      userId: "user-1",
      accountingConnectionId: "conn-1",
      findings: [detectedFinding],
      spendInsightDelegate: delegate,
    })

    assert.equal(createdOrUpdated.length, 1)
    assert.equal(createdOrUpdated[0]?.data.state, "dismissed")
    assert.equal(createdOrUpdated[0]?.data.reviewAction, "keep")
    assert.equal((createdOrUpdated[0]?.data.evidence as { suppressionOverridden?: boolean }).suppressionOverridden, undefined)
  })

  test("reopens suppressed findings when evidence changes", async () => {
    const updates: Array<{ data: Record<string, unknown> }> = []
    const store: StoredFinding = {
      id: "existing-2",
      state: "dismissed",
      reviewAction: "ignore",
      evidenceFingerprint: null,
      evidence: { supplier: "Acme", amountCents: 10000 },
    }

    const delegate = {
      findUnique: async () => ({ ...store }),
      create: async () => ({ id: "created" }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push({ data })
        return { id: store.id }
      },
    }

    await upsertSpendFindings({
      userId: "user-1",
      accountingConnectionId: "conn-1",
      findings: [makeFinding({ supplier: "Acme", amountCents: 12500 })],
      spendInsightDelegate: delegate,
    })

    assert.equal(updates.length, 1)
    assert.equal(updates[0]?.data.state, "open")
    assert.equal(updates[0]?.data.reviewAction, null)
    assert.equal((updates[0]?.data.evidence as { suppressionOverridden?: boolean }).suppressionOverridden, true)
  })
})
