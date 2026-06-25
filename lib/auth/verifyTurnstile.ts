const CF_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify"

export type TurnstileVerifyResult =
  | { success: true }
  | { success: false; error: string; status: 400 | 503 }

/**
 * Verify a Cloudflare Turnstile token server-side.
 *
 * Hard-fails (returns success: false) if:
 *  - token is missing or empty
 *  - TURNSTILE_SECRET_KEY env var is not set
 *  - Cloudflare Siteverify rejects the token
 *  - Siteverify request times out (5 s) or fails with a network error
 *
 * Never throws. Always returns a result object.
 */
export async function verifyTurnstile(
  token: string | null | undefined
): Promise<TurnstileVerifyResult> {
  if (!token) {
    return { success: false, error: "Security check failed. Please try again.", status: 400 }
  }

  const secretKey = process.env.TURNSTILE_SECRET_KEY
  if (!secretKey) {
    console.error("[verifyTurnstile] TURNSTILE_SECRET_KEY is not set")
    return { success: false, error: "Security check failed. Please try again.", status: 503 }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5_000)

  try {
    const response = await fetch(CF_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: secretKey, response: token }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.error(`[verifyTurnstile] Siteverify returned HTTP ${response.status}`)
      return { success: false, error: "Security check failed. Please try again.", status: 503 }
    }

    const data = (await response.json()) as { success: boolean }

    if (!data.success) {
      return { success: false, error: "Security check failed. Please try again.", status: 400 }
    }

    return { success: true }
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === "AbortError") {
      console.error("[verifyTurnstile] Siteverify timed out after 5 s")
    } else {
      console.error(
        "[verifyTurnstile] Siteverify request failed:",
        err instanceof Error ? err.message : "unknown error"
      )
    }
    return { success: false, error: "Security check failed. Please try again.", status: 503 }
  }
}
