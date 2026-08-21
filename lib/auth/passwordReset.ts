import { createClient } from "@/lib/supabase/client"

/**
 * Requests a Supabase password-reset email. Always resolves `ok: true`
 * regardless of whether the email matched an account, so callers never
 * reveal account existence to the caller.
 */
export async function requestPasswordReset(
  email: string,
  redirectTo: string
): Promise<{ ok: true }> {
  const supabase = createClient()
  await supabase.auth.resetPasswordForEmail(email, { redirectTo })
  return { ok: true }
}

export type RecoverySessionResult = { ok: boolean; error?: string }

/** Exchanges the `code` from a Supabase recovery link for a session. */
export async function establishRecoverySession(
  code: string
): Promise<RecoverySessionResult> {
  const supabase = createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  return error ? { ok: false, error: error.message } : { ok: true }
}

export type PasswordUpdateResult = { ok: boolean; error?: string }

export async function completePasswordReset(
  password: string
): Promise<PasswordUpdateResult> {
  const supabase = createClient()
  const { error } = await supabase.auth.updateUser({ password })
  return error ? { ok: false, error: error.message } : { ok: true }
}
