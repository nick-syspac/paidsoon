export type TxUserProfileClient = {
  findUnique: (...args: unknown[]) => Promise<unknown>
  findMany?: (...args: unknown[]) => Promise<unknown>
}

export function getTxUserProfile(
  tx: Record<string, unknown> | null | undefined,
): TxUserProfileClient | null {
  if (!tx || typeof tx !== "object") return null
  if (!("userProfile" in tx)) return null

  const userProfile = tx.userProfile
  if (!userProfile || typeof userProfile !== "object") return null
  if (!("findUnique" in userProfile) || typeof userProfile.findUnique !== "function") {
    return null
  }

  return userProfile as TxUserProfileClient
}
