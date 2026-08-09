export interface CurrencyGroup<T> {
  currency: string
  items: T[]
}

export interface CurrencyDashboardGroup<TActive, TPaid> {
  currency: string
  activeItems: TActive[]
  paidItems: TPaid[]
}

function normalizeCurrency(currency: string): string {
  return currency.toLowerCase()
}

export function groupByCurrency<T extends { currency: string }>(items: T[]): CurrencyGroup<T>[] {
  const groups = new Map<string, T[]>()

  for (const item of items) {
    const currency = normalizeCurrency(item.currency)
    const existing = groups.get(currency)
    if (existing) {
      existing.push(item)
    } else {
      groups.set(currency, [item])
    }
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, groupedItems]) => ({
      currency,
      items: groupedItems,
    }))
}

export function groupDashboardItemsByCurrency<TActive extends { currency: string }, TPaid extends { currency: string }>(
  activeItems: TActive[],
  paidItems: TPaid[],
): CurrencyDashboardGroup<TActive, TPaid>[] {
  const groups = new Map<string, CurrencyDashboardGroup<TActive, TPaid>>()

  for (const item of activeItems) {
    const currency = normalizeCurrency(item.currency)
    const existing = groups.get(currency)
    if (existing) {
      existing.activeItems.push(item)
    } else {
      groups.set(currency, { currency, activeItems: [item], paidItems: [] })
    }
  }

  for (const item of paidItems) {
    const currency = normalizeCurrency(item.currency)
    const existing = groups.get(currency)
    if (existing) {
      existing.paidItems.push(item)
    } else {
      groups.set(currency, { currency, activeItems: [], paidItems: [item] })
    }
  }

  return [...groups.values()].sort((left, right) => left.currency.localeCompare(right.currency))
}
