import { z } from "zod"

import { calculateRequiredDeposit, type DepositCalculationRounding, type DepositSourceTaxMode, type DepositType } from "@/lib/depositGuard/calculations"

export const depositGuardJobCreateSchema = z
  .object({
    customerId: z.string().trim().min(1).optional().nullable(),
    externalQuoteId: z.string().trim().min(1).optional().nullable(),
    externalQuoteNumber: z.string().trim().min(1).optional().nullable(),
    accountingProvider: z.string().trim().min(1).max(60).optional().nullable(),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional().nullable(),
    reference: z.string().trim().max(120).optional().nullable(),
    currency: z.string().trim().length(3),
    quotedAmountCents: z.number().int().min(0).optional().nullable(),
    sourceAmountCents: z.number().int().min(0),
    taxAmountCents: z.number().int().min(0).optional().nullable(),
    sourceTaxMode: z.enum(["inclusive", "exclusive"]),
    depositType: z.enum(["none", "percentage", "fixed"]),
    depositPercentage: z.number().min(0).max(100).optional().nullable(),
    depositFixedAmountCents: z.number().int().min(0).optional().nullable(),
    roundingMode: z.enum(["nearest", "up", "down"]).optional(),
    expectedStartDate: z.string().datetime().optional().nullable(),
    expectedCompletionDate: z.string().datetime().optional().nullable(),
  })
  .strict()

export type DepositGuardJobCreateInput = z.infer<typeof depositGuardJobCreateSchema>

export const depositGuardJobPreviewSchema = depositGuardJobCreateSchema
  .omit({ name: true })
  .extend({
    name: z.string().trim().max(200).optional().nullable(),
    sourceAmountCents: z.number().int().min(0).default(0),
    currency: z.string().trim().length(3).default("aud"),
    sourceTaxMode: z.enum(["inclusive", "exclusive"]).default("exclusive"),
    depositType: z.enum(["none", "percentage", "fixed"]).default("none"),
    roundingMode: z.enum(["nearest", "up", "down"]).optional(),
  })

export type DepositGuardJobPreviewInput = z.infer<typeof depositGuardJobPreviewSchema>

export interface DepositGuardJobPreviewResult {
  sourceAmountCents: number
  taxAmountCents: number
  totalAmountCents: number
  requiredDepositAmountCents: number
  amountPaidCents: number
  outstandingAmountCents: number
  commencementBlocked: boolean
  depositType: DepositType
  sourceTaxMode: DepositSourceTaxMode
  roundingMode: DepositCalculationRounding
}

export function buildDepositGuardJobPreview(
  input: DepositGuardJobPreviewInput,
): DepositGuardJobPreviewResult {
  const preview = calculateRequiredDeposit({
    depositType: input.depositType,
    depositPercentage: input.depositPercentage ?? undefined,
    depositFixedAmountCents: input.depositFixedAmountCents ?? undefined,
    sourceAmountCents: input.sourceAmountCents,
    taxAmountCents: input.taxAmountCents ?? undefined,
    sourceTaxMode: input.sourceTaxMode,
    roundingMode: input.roundingMode,
    amountPaidCents: 0,
  })

  return {
    sourceAmountCents: preview.sourceAmountCents,
    taxAmountCents: preview.taxAmountCents,
    totalAmountCents: preview.totalAmountCents,
    requiredDepositAmountCents: preview.requiredDepositAmountCents,
    amountPaidCents: preview.amountPaidCents,
    outstandingAmountCents: preview.outstandingAmountCents,
    commencementBlocked: preview.commencementBlocked,
    depositType: input.depositType,
    sourceTaxMode: input.sourceTaxMode,
    roundingMode: input.roundingMode ?? "nearest",
  }
}