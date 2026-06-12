const LIVE_TRUE_VALUES = new Set(["true", "1", "yes", "on"])
const LIVE_FALSE_VALUES = new Set(["false", "0", "no", "off"])

export function parseLiveEnv(rawValue: string | undefined | null): boolean {
  if (!rawValue) {
    return false
  }

  const normalized = rawValue.trim().toLowerCase()

  if (LIVE_TRUE_VALUES.has(normalized)) {
    return true
  }

  if (LIVE_FALSE_VALUES.has(normalized)) {
    return false
  }

  return false
}

export function isLiveMode(): boolean {
  return parseLiveEnv(process.env.LIVE)
}

export function isAuthEntryPath(pathname: string): boolean {
  return pathname === "/sign-in" || pathname === "/sign-up"
}

export function shouldBlockAuthEntry(pathname: string, liveMode: boolean): boolean {
  return !liveMode && isAuthEntryPath(pathname)
}

export function shouldShowNotLiveBanner(liveMode: boolean): boolean {
  return !liveMode
}
