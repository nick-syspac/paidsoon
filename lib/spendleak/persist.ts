import { createHash } from "node:crypto"

import { prismaAdmin } from "@/lib/db/admin"
import type { Prisma } from "@/lib/generated/prisma/client"
import type { SpendFinding } from "@/lib/spendleak/engine"

type SpendInsightDelegate = {
  findUnique: typeof prismaAdmin.spendInsight.findUnique
  create: typeof prismaAdmin.spendInsight.create
  update: typeof prismaAdmin.spendInsight.update
}

export type SpendInsightPolicyContext = {
  accountDisplayRevision: number
  accountDisplayFromDate: Date | null
  accountDisplayTimeZone: string | null
}

export function filterCurrentSpendFindings<T extends { accountDisplayRevision?: number | null; accountDisplayFromDate?: Date | null; accountDisplayTimeZone?: string | null }>(
  findings: T[],
  policy: SpendInsightPolicyContext,
): T[] {
  const normalizedPolicy = {
    accountDisplayRevision: policy.accountDisplayRevision ?? 0,
    accountDisplayFromDate: policy.accountDisplayFromDate ?? null,
    accountDisplayTimeZone: policy.accountDisplayTimeZone ?? "Australia/Melbourne",
  }

  return findings.filter((finding) => {
    const revision = finding.accountDisplayRevision ?? null
    const policyDate = finding.accountDisplayFromDate ?? null
    const policyTimeZone = finding.accountDisplayTimeZone ?? null

    if (revision === null) {
      return normalizedPolicy.accountDisplayRevision === 0 && normalizedPolicy.accountDisplayFromDate === null
    }

    if (revision !== normalizedPolicy.accountDisplayRevision) return false
    if (normalizedPolicy.accountDisplayFromDate === null) {
      return policyDate === null && policyTimeZone === null
    }

    const effectiveFindingDate = policyDate ? new Date(policyDate) : null
    const normalizedFindingDate = effectiveFindingDate ? effectiveFindingDate.toISOString() : null
    const normalizedPolicyDate = normalizedPolicy.accountDisplayFromDate ? new Date(normalizedPolicy.accountDisplayFromDate).toISOString() : null
    if (normalizedFindingDate !== normalizedPolicyDate) return false
    if (policyTimeZone !== null && normalizedPolicy.accountDisplayTimeZone && policyTimeZone !== normalizedPolicy.accountDisplayTimeZone) {
      return false
    }
    return true
  })
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
  accountDisplayPolicy?: SpendInsightPolicyContext | null
  spendInsightDelegate?: SpendInsightDelegate
}): Promise<number> {
  const { userId, accountingConnectionId, findings } = params
  const spendInsightDelegate = params.spendInsightDelegate ?? prismaAdmin.spendInsight
  const accountDisplayPolicy = params.accountDisplayPolicy ?? {
    accountDisplayRevision: 0,
    accountDisplayFromDate: null,
    accountDisplayTimeZone: "Australia/Melbourne",
  }
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
      const createData = {
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
        accountDisplayRevision: accountDisplayPolicy.accountDisplayRevision,
        accountDisplayFromDate: accountDisplayPolicy.accountDisplayFromDate,
        accountDisplayTimeZone: accountDisplayPolicy.accountDisplayTimeZone,
      } as Prisma.SpendInsightCreateInput

      await spendInsightDelegate.create({ data: createData })
      upserted += 1
      continue
    }

    const sameFingerprint = existing.evidenceFingerprint === fingerprint
    const preserveReview = shouldPreserveReviewAction(existing.reviewAction, sameFingerprint)
    const suppressionOverridden = shouldMarkSuppressionOverridden(existing.reviewAction, sameFingerprint)

    const nextEvidence = suppressionOverridden
      ? ({ ...finding.evidence, suppressionOverridden: true } as Prisma.InputJsonValue)
      : (finding.evidence as Prisma.InputJsonValue)

    const updateData = {
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
      accountDisplayRevision: accountDisplayPolicy.accountDisplayRevision,
      accountDisplayFromDate: accountDisplayPolicy.accountDisplayFromDate,
      accountDisplayTimeZone: accountDisplayPolicy.accountDisplayTimeZone,
    } as Prisma.SpendInsightUpdateInput

    await spendInsightDelegate.update({
      where: { id: existing.id },
      data: updateData,
    })

    upserted += 1
  }

  return upserted
}
