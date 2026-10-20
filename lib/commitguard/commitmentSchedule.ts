import { z } from "zod"

// Read models still accept legacy custom schedules. Write boundaries do not
// normalize unknown/custom input into a plausible one-off schedule.
export const SUPPORTED_COMMITMENT_FREQUENCIES = [
  "one_off", "weekly", "fortnightly", "monthly", "quarterly", "six_monthly", "annual",
] as const

export const CommitmentFrequencyWriteSchema = z.enum(SUPPORTED_COMMITMENT_FREQUENCIES, {
  error: "Choose a supported frequency. Custom recurrence is not supported.",
})
export const CommitmentRecurrenceRuleWriteSchema = z.null({
  error: "Custom recurrence rules are not supported. Choose a supported frequency.",
}).optional()

const ScheduleWriteSchema = z.object({
  frequency: CommitmentFrequencyWriteSchema.optional(),
  recurrenceRule: CommitmentRecurrenceRuleWriteSchema,
  startDate: z.date().nullable().optional(),
  endDate: z.date().nullable().optional(),
  nextDueDate: z.date().nullable().optional(),
})

type ScheduleDates = {
  startDate?: Date | null
  endDate?: Date | null
  nextDueDate?: Date | null
}

function utcDay(date: Date): number {
  const value = new Date(date)
  return value.setUTCHours(0, 0, 0, 0)
}

const ScheduleBoundariesSchema = z.object({
  startDate: z.date().nullable().optional(),
  endDate: z.date().nullable().optional(),
  nextDueDate: z.date().nullable().optional(),
}).superRefine(({ startDate, endDate, nextDueDate }, ctx) => {
  if (startDate && endDate && utcDay(startDate) > utcDay(endDate)) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date must be on or after start date." })
  }
  if (nextDueDate && startDate && utcDay(nextDueDate) < utcDay(startDate)) {
    ctx.addIssue({ code: "custom", path: ["nextDueDate"], message: "Next due date must be on or after start date." })
  }
  if (nextDueDate && endDate && utcDay(nextDueDate) > utcDay(endDate)) {
    ctx.addIssue({ code: "custom", path: ["nextDueDate"], message: "Next due date must be on or before end date." })
  }
})

export function validateCommitmentScheduleWrite(
  input: ScheduleDates & { frequency?: string; recurrenceRule?: unknown },
  existing?: ScheduleDates,
): void {
  if (existing) ScheduleWriteSchema.parse(input)
  else ScheduleWriteSchema.required({ frequency: true }).parse(input)
  // Unrelated edits must not force owners to repair a legacy custom schedule.
  if (!existing || ["frequency", "startDate", "endDate", "nextDueDate"].some(
    (key) => input[key as keyof typeof input] !== undefined,
  )) {
    ScheduleBoundariesSchema.parse({
      startDate: input.startDate === undefined ? existing?.startDate : input.startDate,
      endDate: input.endDate === undefined ? existing?.endDate : input.endDate,
      nextDueDate: input.nextDueDate === undefined ? existing?.nextDueDate : input.nextDueDate,
    })
  }
}