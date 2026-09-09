import type { OwnersDigestProviderResult, OwnersDigestSource } from "@/lib/ownersDigest/types"

export interface OwnersDigestSignalProvider {
  source: OwnersDigestSource
  load: () => Promise<OwnersDigestProviderResult>
}

export async function runOwnersDigestProviderRegistry(
  providers: OwnersDigestSignalProvider[],
): Promise<OwnersDigestProviderResult[]> {
  const settled = await Promise.allSettled(providers.map((provider) => provider.load()))

  return settled.map((entry, index) => {
    if (entry.status === "fulfilled") {
      return entry.value
    }

    return {
      source: providers[index]?.source ?? "paidsoon",
      status: "unavailable",
      signals: [],
      metrics: [],
      dataAsOf: null,
      stale: false,
      entitled: true,
      configured: true,
      available: false,
      errorCode: "provider_failed",
      errorSummary: entry.reason instanceof Error ? entry.reason.message : "provider_failed",
    } satisfies OwnersDigestProviderResult
  })
}
