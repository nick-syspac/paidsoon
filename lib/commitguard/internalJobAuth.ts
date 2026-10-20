import { timingSafeEqual } from "node:crypto"

export function isCommitGuardInternalJob(request: Request): boolean {
  const secret = process.env.INTERNAL_JOBS_SECRET
  const header = request.headers.get("authorization")
  if (!secret || !header) return false
  const actual = Buffer.from(header)
  const expected = Buffer.from(`Bearer ${secret}`)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}