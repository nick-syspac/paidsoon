import test from "node:test"
import assert from "node:assert/strict"
import { z } from "zod"
import { resolveFreelancerName } from "@/lib/email/send"

// ---------------------------------------------------------------------------
// 8.1 — Display name fallback chain
// ---------------------------------------------------------------------------

test("resolveFreelancerName: uses displayName when set", () => {
  assert.equal(resolveFreelancerName("Jane Smith", "Jane via metadata", "jane@example.com"), "Jane Smith")
})

test("resolveFreelancerName: falls back to user_metadata.full_name when displayName is null", () => {
  assert.equal(resolveFreelancerName(null, "Jane via metadata", "jane@example.com"), "Jane via metadata")
})

test("resolveFreelancerName: falls back to email prefix when displayName and metadata are null", () => {
  assert.equal(resolveFreelancerName(null, null, "jane@example.com"), "jane")
})

test("resolveFreelancerName: falls back to hardcoded string when all inputs are null/undefined", () => {
  assert.equal(resolveFreelancerName(null, null, null), "Your freelancer")
  assert.equal(resolveFreelancerName(undefined, undefined, undefined), "Your freelancer")
})

// ---------------------------------------------------------------------------
// 8.2 — Profile PATCH Zod validation
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  displayName: z
    .string()
    .min(1, "Display name cannot be empty")
    .max(100, "Display name must be 100 characters or fewer"),
})

test("profile PATCH schema: accepts a valid display name", () => {
  const result = patchSchema.safeParse({ displayName: "Jane Smith" })
  assert.equal(result.success, true)
})

test("profile PATCH schema: rejects empty string", () => {
  const result = patchSchema.safeParse({ displayName: "" })
  assert.equal(result.success, false)
  if (!result.success) {
    assert.ok(result.error.issues[0].message.includes("empty"))
  }
})

test("profile PATCH schema: rejects display name longer than 100 characters", () => {
  const result = patchSchema.safeParse({ displayName: "a".repeat(101) })
  assert.equal(result.success, false)
  if (!result.success) {
    assert.ok(result.error.issues[0].message.includes("100"))
  }
})

test("profile PATCH schema: accepts display name of exactly 100 characters", () => {
  const result = patchSchema.safeParse({ displayName: "a".repeat(100) })
  assert.equal(result.success, true)
})

test("profile PATCH schema: rejects missing displayName field", () => {
  const result = patchSchema.safeParse({})
  assert.equal(result.success, false)
})
