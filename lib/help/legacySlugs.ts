const LEGACY_HELP_SLUG_ALIASES: Record<string, string> = {
  "connect-myob-business": "connect-myob",
  "configure-schedule": "configure-reminder-schedule",
  "reminder-schedule": "configure-reminder-schedule",
  "pause-invoice-reminders": "pause-reminders",
  "promise-to-pay": "record-a-promise-to-pay",
  "manual-invoice-resolve": "manually-resolve-an-invoice",
}

export function resolveCanonicalHelpSlug(slug: string): string {
  const normalized = slug.trim().replace(/^\/+|\/+$/g, "") || "index"
  return LEGACY_HELP_SLUG_ALIASES[normalized] ?? normalized
}

export function isLegacyHelpSlug(slug: string): boolean {
  const normalized = slug.trim().replace(/^\/+|\/+$/g, "") || "index"
  return normalized in LEGACY_HELP_SLUG_ALIASES
}
