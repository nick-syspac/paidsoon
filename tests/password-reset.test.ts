import { before, beforeEach, describe, mock, test } from "node:test"
import assert from "node:assert/strict"

type ResetEmailResult = { error: Error | null }
type UpdateUserResult = { error: Error | null }

let resetEmailResult: ResetEmailResult = { error: null }
let updateUserResult: UpdateUserResult = { error: null }

let resetEmailArgs: unknown = null
let updateUserArgs: unknown = null

let requestPasswordReset: typeof import("@/lib/auth/passwordReset").requestPasswordReset
let completePasswordReset: typeof import("@/lib/auth/passwordReset").completePasswordReset

describe("password reset flow", () => {
  before(async () => {
    await mock.module("@/lib/supabase/client", {
      namedExports: {
        createClient: () => ({
          auth: {
            resetPasswordForEmail: async (email: string, options: unknown) => {
              resetEmailArgs = { email, options }
              return resetEmailResult
            },
            updateUser: async (args: unknown) => {
              updateUserArgs = args
              return updateUserResult
            },
          },
        }),
      },
    })

    ;({ requestPasswordReset, completePasswordReset } =
      await import("@/lib/auth/passwordReset"))
  })

  beforeEach(() => {
    resetEmailResult = { error: null }
    updateUserResult = { error: null }
    resetEmailArgs = null
    updateUserArgs = null
  })

  test("requestPasswordReset calls Supabase with the email and redirect URL", async () => {
    const result = await requestPasswordReset(
      "user@example.com",
      "https://paidsoon.test/reset-password",
    )

    assert.deepEqual(result, { ok: true })
    assert.deepEqual(resetEmailArgs, {
      email: "user@example.com",
      options: { redirectTo: "https://paidsoon.test/reset-password" },
    })
  })

  test("requestPasswordReset always reports ok even when the email has no account", async () => {
    // Supabase itself does not surface a distinguishable error for unknown emails,
    // but this asserts the caller never depends on one to avoid leaking account existence.
    resetEmailResult = { error: new Error("should never be surfaced to caller") }

    const result = await requestPasswordReset(
      "unknown@example.com",
      "https://paidsoon.test/reset-password",
    )

    assert.deepEqual(result, { ok: true })
  })

  test("completePasswordReset updates the password", async () => {
    const result = await completePasswordReset("new-strong-password")

    assert.deepEqual(result, { ok: true })
    assert.deepEqual(updateUserArgs, { password: "new-strong-password" })
  })

  test("completePasswordReset reports failure when Supabase rejects the update", async () => {
    updateUserResult = { error: new Error("Auth session missing") }

    const result = await completePasswordReset("new-strong-password")

    assert.equal(result.ok, false)
    assert.equal(result.error, "Auth session missing")
  })
})
