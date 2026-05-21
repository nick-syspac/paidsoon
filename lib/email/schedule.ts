interface ScheduleConfig {
  email1DaysAfterDue: number
  email2DaysAfterDue: number
  email3DaysAfterDue: number
}

/**
 * Compute the date when the next email (at given stage) should be sent.
 * Stage 1 = use email1DaysAfterDue, etc.
 */
export function computeNextEmailAt(
  dueDate: Date,
  stage: 1 | 2 | 3,
  schedule: ScheduleConfig
): Date {
  const daysMap: Record<1 | 2 | 3, number> = {
    1: schedule.email1DaysAfterDue,
    2: schedule.email2DaysAfterDue,
    3: schedule.email3DaysAfterDue,
  }
  const days = daysMap[stage]
  const result = new Date(dueDate)
  result.setDate(result.getDate() + days)
  return result
}
