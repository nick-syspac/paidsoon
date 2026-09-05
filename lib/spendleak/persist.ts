import { createHash } from "node:crypto"

import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma } from "@/lib/generated/prisma/client"
import type { SpendFinding } from "@/lib/spendleak/engine"

type SpendInsightDelegate = {
  findUnique: typeof prismaAdmin.spendInsight.findUnique
  create: typeof prismaAdmin.spendInsight.create
  update: typeof prismaAdmin.spendInsight.update
}

function fingerprintForFinding(finding: SpendFinding): string {
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

function shouldPreserveReviewAction(reviewAction: string | null | undefined, sameFingerprint: boolean): boolean {
  if (!reviewAction) return false
  return sameFingerprint
}

function shouldMarkSuppressionOverridden(reviewAction: string | null | undefined, sameFingerprint: boolean): boolean {
  if (sameFingerprint) return false
  return reviewAction === "keep" || reviewAction === "ignore"
}

export async function upsertSpendFindings(params: {
  userId: string
  accountingConnectionId: string | null
  findings: SpendFinding[]
  spendInsightDelegate?: SpendInsightDelegate
}): Promise<number> {
  const { userId, accountingConnectionId, findings } = params
  const spendInsightDelegate = params.spendInsightDelegate ?? prismaAdmin.spendInsight
  let upserted = 0

  for (const finding of findings) {
    const fingerprint = fingerprintForFinding(finding)
    const existing = await spendInsightDelegate.findUnique({
      where: {
        userId_findingType_subjectKey: {
          userId,
          findingType: finding.findingType,
          subjectKey: finding.subjectKey,
        },
      },
      select: {
        id: true,
        state: true,
        resolvedAt: true,
        reviewAction: true,
        reviewActionAt: true,
        reviewActionBy: true,
        reviewNote: true,
        evidenceFingerprint: true,
      },
    })

    if (!existing) {
      await spendInsightDelegate.create({
        data: {
          userId,
          accountingConnectionId,
          findingType: finding.findingType,
          subjectKey: finding.subjectKey,
          severity: finding.severity,
          summary: finding.summary,
          state: "open",
          estimatedMonthlyCents: finding.estimatedMonthlyCents ?? null,
          estimatedAnnualCents: finding.estimatedAnnualCents ?? null,
          evidence: finding.evidence as Prisma.InputJsonValue,
          evidenceFingerprint: fingerprint,
          detectedAt: finding.detectedAt,
        },
      })
      upserted += 1
      continue
    }

    const sameFingerprint = existing.evidenceFingerprint === fingerprint
    const preserveReview = shouldPreserveReviewAction(existing.reviewAction, sameFingerprint)
    const suppressionOverridden = shouldMarkSuppressionOverridden(existing.reviewAction, sameFingerprint)

    const nextEvidence = suppressionOverridden
      ? ({ ...finding.evidence, suppressionOverridden: true } as Prisma.InputJsonValue)
      : (finding.evidence as Prisma.InputJsonValue)

    await spendInsightDelegate.update({
      where: { id: existing.id },
      data: {
        accountingConnectionId,
        severity: finding.severity,
        summary: finding.summary,
        estimatedMonthlyCents: finding.estimatedMonthlyCents ?? null,
        estimatedAnnualCents: finding.estimatedAnnualCents ?? null,
        evidence: nextEvidence,
        evidenceFingerprint: fingerprint,
        detectedAt: finding.detectedAt,
        state: preserveReview ? existing.state : "open",
        resolvedAt: preserveReview ? existing.resolvedAt : null,
        reviewAction: preserveReview ? existing.reviewAction : null,
        reviewActionAt: preserveReview ? existing.reviewActionAt : null,
        reviewActionBy: preserveReview ? existing.reviewActionBy : null,
        reviewNote: preserveReview ? existing.reviewNote : null,
      },
    })

    upserted += 1
  }

  return upserted
}
