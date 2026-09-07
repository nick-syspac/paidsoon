export function isInvalidSupabaseApiKey(error: unknown): boolean {
  return error instanceof Error && error.message === "Invalid API key"
}

export function isSupabaseCaptchaProviderMisconfigured(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  return (
    message.includes("captcha protection:") &&
    (message.includes("invalid-input-secret") || message.includes("missing-input-secret"))
  )
}

export function isSupabaseAuthServiceMisconfigured(error: unknown): boolean {
  return isInvalidSupabaseApiKey(error) || isSupabaseCaptchaProviderMisconfigured(error)
}