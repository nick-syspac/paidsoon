export type PrimitiveDraftValue = string | number | boolean | null | undefined

export type DraftRecord = Record<string, PrimitiveDraftValue>

export function isDraftDirty<T extends DraftRecord>(draft: T, persisted: T): boolean {
  const keys = new Set([...Object.keys(draft), ...Object.keys(persisted)])
  for (const key of keys) {
    if (draft[key] !== persisted[key]) return true
  }
  return false
}

export function resolvePersistedDraft<T extends DraftRecord>(
  currentDraft: T,
  persistedDraft: T,
  wasSuccessful: boolean,
): T {
  if (!wasSuccessful) return persistedDraft
  return { ...currentDraft }
}
