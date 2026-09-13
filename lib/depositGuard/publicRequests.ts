import { createHash } from "node:crypto"

import { prismaAdmin } from "@/lib/db/admin"

export type PublicDepositRequestState = "active" | "paid" | "expired" | "cancelled" | "unavailable"

export interface PublicDepositRequestView {
  id: string
  state: PublicDepositRequestState
  amountCents: number
  taxAmountCents: number | null
  totalAmountCents: number
  currency: string
  dueDate: Date
  description: string | null
  externalPaymentUrl: string | null
  firstViewedAt: Date | null
  lastViewedAt: Date | null
  paidAt: Date | null
  cancelledAt: Date | null
  tokenExpiresAt: Date | null
}

const LOOKUP_WINDOW_MS = 60_000
const LOOKUP_LIMIT = 8

type LookupBucket = {
  attempts: number
  resetAt: number
}

const lookupBuckets = new Map<string, LookupBucket>()

function hashPublicToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function resolveState(input: {
  status: string
  tokenExpiresAt: Date | null
  now: Date
}): PublicDepositRequestState {
  if (input.status === "paid") return "paid"
  if (input.status === "cancelled") return "cancelled"
  if (input.status === "expired" || input.status === "failed") return "expired"
  if (input.tokenExpiresAt && input.tokenExpiresAt.getTime() < input.now.getTime()) {
    return "expired"
  }
  if (input.status === "requested" || input.status === "viewed" || input.status === "partially_paid") {
    return "active"
  }
  if (input.status === "draft") {
    return "active"
  }
  return "unavailable"
}

function getLookupKey(tokenHash: string, clientFingerprint: string): string {
  return `${tokenHash}:${clientFingerprint || "unknown"}`
}

function registerLookupAttempt(tokenHash: string, clientFingerprint: string, now: number): boolean {
  const key = getLookupKey(tokenHash, clientFingerprint)
  const bucket = lookupBuckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    lookupBuckets.set(key, { attempts: 1, resetAt: now + LOOKUP_WINDOW_MS })
    return true
  }

  if (bucket.attempts >= LOOKUP_LIMIT) {
    return false
  }

  bucket.attempts += 1
  return true
}

export function resetPublicDepositRequestLookupThrottleForTests(): void {
  lookupBuckets.clear()
}

export async function getPublicDepositRequestView(
  token: string,
  options: { clientFingerprint?: string; now?: Date } = {},
): Promise<PublicDepositRequestView> {
  const tokenHash = hashPublicToken(token)
  const now = options.now ?? new Date()
  const clientFingerprint = options.clientFingerprint?.trim() || "unknown"

  if (!registerLookupAttempt(tokenHash, clientFingerprint, now.getTime())) {
    return {
      id: "",
      state: "unavailable",
      amountCents: 0,
      taxAmountCents: null,
      totalAmountCents: 0,
      currency: "aud",
      dueDate: now,
      description: null,
      externalPaymentUrl: null,
      firstViewedAt: null,
      lastViewedAt: null,
      paidAt: null,
      cancelledAt: null,
      tokenExpiresAt: null,
    }
  }

  const request = await prismaAdmin.depositRequest.findUnique({
    where: { publicTokenHash: tokenHash },
    select: {
      id: true,
      jobId: true,
      status: true,
      amountCents: true,
      taxAmountCents: true,
      totalAmountCents: true,
      currency: true,
      dueDate: true,
      description: true,
      externalPaymentUrl: true,
      firstViewedAt: true,
      lastViewedAt: true,
      paidAt: true,
      cancelledAt: true,
      tokenExpiresAt: true,
      job: { select: { userId: true } },
    },
  })

  if (!request) {
    return {
      id: "",
      state: "unavailable",
      amountCents: 0,
      taxAmountCents: null,
      totalAmountCents: 0,
      currency: "aud",
      dueDate: now,
      description: null,
      externalPaymentUrl: null,
      firstViewedAt: null,
      lastViewedAt: null,
      paidAt: null,
      cancelledAt: null,
      tokenExpiresAt: null,
    }
  }

  const state = resolveState({ status: request.status, tokenExpiresAt: request.tokenExpiresAt, now })
  if (state !== "active") {
    return {
      id: request.id,
      state,
      amountCents: request.amountCents,
      taxAmountCents: request.taxAmountCents,
      totalAmountCents: request.totalAmountCents,
      currency: request.currency,
      dueDate: request.dueDate,
      description: request.description,
      externalPaymentUrl: request.externalPaymentUrl,
      firstViewedAt: request.firstViewedAt,
      lastViewedAt: request.lastViewedAt,
      paidAt: request.paidAt,
      cancelledAt: request.cancelledAt,
      tokenExpiresAt: request.tokenExpiresAt,
    }
  }

  const updated = await prismaAdmin.$transaction(async (tx) => {
    const current = await tx.depositRequest.findUnique({
      where: { publicTokenHash: tokenHash },
      select: {
        id: true,
        jobId: true,
        status: true,
        amountCents: true,
        taxAmountCents: true,
        totalAmountCents: true,
        currency: true,
        dueDate: true,
        description: true,
        externalPaymentUrl: true,
        firstViewedAt: true,
        lastViewedAt: true,
        paidAt: true,
        cancelledAt: true,
        tokenExpiresAt: true,
        job: { select: { userId: true } },
      },
    })

    if (!current) {
      return null
    }

    const shouldMarkFirstView = current.firstViewedAt == null
    const shouldFlipStatus = current.status === "requested"
    const nextViewedAt = now
    const updateData: {
      firstViewedAt?: Date
      lastViewedAt?: Date
      status?: "viewed"
    } = {
      lastViewedAt: nextViewedAt,
    }

    if (shouldMarkFirstView) {
      updateData.firstViewedAt = nextViewedAt
    }
    if (shouldFlipStatus) {
      updateData.status = "viewed"
    }

    const next = await tx.depositRequest.update({
      where: { id: current.id },
      data: updateData,
      select: {
        id: true,
        status: true,
        amountCents: true,
        taxAmountCents: true,
        totalAmountCents: true,
        currency: true,
        dueDate: true,
        description: true,
        externalPaymentUrl: true,
        firstViewedAt: true,
        lastViewedAt: true,
        paidAt: true,
        cancelledAt: true,
        tokenExpiresAt: true,
      },
    })

    if (shouldMarkFirstView) {
      await tx.depositGuardEvent.create({
        data: {
          userId: current.job.userId,
          depositRequestId: current.id,
          eventType: "request_viewed",
          metadata: {
            publicPage: true,
          } as never,
        },
      })
    }

    return next
  })

  if (!updated) {
    return {
      id: request.id,
      state: "unavailable",
      amountCents: request.amountCents,
      taxAmountCents: request.taxAmountCents,
      totalAmountCents: request.totalAmountCents,
      currency: request.currency,
      dueDate: request.dueDate,
      description: request.description,
      externalPaymentUrl: request.externalPaymentUrl,
      firstViewedAt: request.firstViewedAt,
      lastViewedAt: request.lastViewedAt,
      paidAt: request.paidAt,
      cancelledAt: request.cancelledAt,
      tokenExpiresAt: request.tokenExpiresAt,
    }
  }

  return {
    id: updated.id,
    state: resolveState({ status: updated.status, tokenExpiresAt: updated.tokenExpiresAt, now }),
    amountCents: updated.amountCents,
    taxAmountCents: updated.taxAmountCents,
    totalAmountCents: updated.totalAmountCents,
    currency: updated.currency,
    dueDate: updated.dueDate,
    description: updated.description,
    externalPaymentUrl: updated.externalPaymentUrl,
    firstViewedAt: updated.firstViewedAt,
    lastViewedAt: updated.lastViewedAt,
    paidAt: updated.paidAt,
    cancelledAt: updated.cancelledAt,
    tokenExpiresAt: updated.tokenExpiresAt,
  }
}