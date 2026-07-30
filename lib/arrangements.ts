import { z } from "zod"

export const ArrangementTypeSchema = z.enum([
  "full_payment",
  "partial_payment",
  "instalment_plan",
])

export const ArrangementStatusSchema = z.enum([
  "active",
  "broken",
  "fulfilled",
  "expired",
  "cancelled",
])

export const InstalmentItemSchema = z.object({
  dueAt: z.string().datetime(),
  amount: z.number().int().positive(),
})

export const CreateArrangementSchema = z
  .object({
    invoiceIds: z.array(z.string().min(1)).min(1),
    arrangementType: ArrangementTypeSchema,
    promisedPayBy: z.string().datetime().optional(),
    agreedAmount: z.number().int().positive().optional(),
    currency: z.string().length(3).optional(),
    termsNotes: z.string().max(1000).optional(),
    planSchedule: z.array(InstalmentItemSchema).min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.arrangementType === "full_payment") {
      if (!value.promisedPayBy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "promisedPayBy is required for full_payment",
          path: ["promisedPayBy"],
        })
      }
      if (value.planSchedule) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "planSchedule is not allowed for full_payment",
          path: ["planSchedule"],
        })
      }
    }

    if (value.arrangementType === "partial_payment") {
      if (!value.promisedPayBy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "promisedPayBy is required for partial_payment",
          path: ["promisedPayBy"],
        })
      }
      if (!value.agreedAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "agreedAmount is required for partial_payment",
          path: ["agreedAmount"],
        })
      }
      if (value.planSchedule) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "planSchedule is not allowed for partial_payment",
          path: ["planSchedule"],
        })
      }
    }

    if (value.arrangementType === "instalment_plan") {
      if (!value.planSchedule || value.planSchedule.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "planSchedule is required for instalment_plan",
          path: ["planSchedule"],
        })
      }
      if (value.promisedPayBy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "promisedPayBy is not allowed for instalment_plan",
          path: ["promisedPayBy"],
        })
      }
    }
  })

export const UpdateArrangementStatusSchema = z
  .object({
    status: ArrangementStatusSchema,
  })
  .strict()

export type CreateArrangementInput = z.infer<typeof CreateArrangementSchema>
export type UpdateArrangementStatusInput = z.infer<typeof UpdateArrangementStatusSchema>
