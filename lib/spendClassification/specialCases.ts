const SPLIT_LINE_KEYS = ["LineItems", "Lines"] as const

/** Detect split provider records when raw lines exist but PaidSoon has no normalized allocations. */
export function hasUnnormalizedSplitLineDetails(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const source = value as Record<string, unknown>
  return SPLIT_LINE_KEYS.some((key) => Array.isArray(source[key]) && source[key].length > 1)
}
