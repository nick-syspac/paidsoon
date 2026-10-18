import assert from "node:assert/strict"

export type LedgerRow = {
  stripeEventId: string; processingStatus: string; processingToken: string | null;
  processingLeaseUntil: Date | null; processedAt: Date | null; processingNote: string | null;
}
type Write = { where: Record<string, unknown>; data: Record<string, unknown> }

function matches(row: LedgerRow, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return (expected as Record<string, unknown>[]).some((part) => matches(row, part))
    const actual = row[key as keyof LedgerRow]
    if (expected && typeof expected === "object") {
      if ("in" in expected) return (expected.in as unknown[]).includes(actual)
      if ("gt" in expected) return actual instanceof Date && actual > (expected.gt as Date)
      if ("lte" in expected) return actual instanceof Date && actual <= (expected.lte as Date)
    }
    return actual === expected
  })
}

/** In-memory CAS, not an unconditional successful mock: stale fences must fail. */
export class WebhookLedgerMock {
  rows = new Map<string, LedgerRow>()
  creates: { data: Record<string, unknown> }[] = []
  finishes: Write[] = []
  claims: Write[] = []
  fences: Write[] = []
  createError: string | null = null
  finishError = false
  seed(id: string, status: string, extra: Partial<LedgerRow> = {}): LedgerRow {
    const row = { stripeEventId: id, processingStatus: status, processingToken: null,
      processingLeaseUntil: null, processedAt: null, processingNote: null, ...extra }
    this.rows.set(id, row)
    return row
  }
  delegate = {
    create: async (args: { data: Record<string, unknown> }): Promise<LedgerRow> => {
      if (this.createError) throw { code: this.createError }
      const id = String(args.data.stripeEventId)
      if (this.rows.has(id)) throw { code: "P2002" }
      this.creates.push(args)
      return this.seed(id, "received")
    },
    findUnique: async ({ where }: { where: { stripeEventId: string } }): Promise<LedgerRow | null> =>
      this.rows.get(where.stripeEventId) ?? null,
    updateMany: async (args: Write): Promise<{ count: number }> => {
      const status = args.data.processingStatus
      if (status === "processing") this.claims.push(args)
      else {
        // Every post-claim write must contain the stable token AND live lease.
        assert.equal(args.where.processingStatus, "processing")
        assert.equal(typeof args.where.processingToken, "string")
        assert.ok(args.where.processingLeaseUntil && typeof args.where.processingLeaseUntil === "object" && "gt" in args.where.processingLeaseUntil)
        if (status) {
          this.finishes.push(args)
          if (this.finishError) throw new Error("private finish failure")
        } else this.fences.push(args)
      }
      const row = this.rows.get(String(args.where.stripeEventId))
      if (!row || !matches(row, args.where)) return { count: 0 }
      Object.assign(row, args.data)
      return { count: 1 }
    },
  }
}