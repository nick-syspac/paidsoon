export function getBrokenPromiseCountForDebtor(
  countsByDebtor: Record<string, number>,
  clientEmail: string,
): number {
  return countsByDebtor[clientEmail.toLowerCase()] ?? 0
}

export function isPromiseDebtorHighPriority(
  brokenPromiseCount: number,
  escalationThreshold: number,
): boolean {
  return brokenPromiseCount >= Math.max(1, escalationThreshold)
}
