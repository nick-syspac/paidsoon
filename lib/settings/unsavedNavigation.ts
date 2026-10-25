export function shouldInterceptSettingsNavigationTarget(href: string, origin: string): boolean {
  if (!href) return false

  try {
    const url = new URL(href, origin)
    if (url.origin !== origin) return false
    return url.pathname.startsWith("/settings")
  } catch {
    return false
  }
}

export function shouldConfirmLeaveSettings(hasUnsavedChanges: boolean, href: string, origin: string): boolean {
  if (!hasUnsavedChanges) return false
  return shouldInterceptSettingsNavigationTarget(href, origin)
}
