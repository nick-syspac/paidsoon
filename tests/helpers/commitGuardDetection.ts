import assert from "node:assert/strict"
import type { PrismaTx } from "@/lib/db/withUserContext"

export type DetectionWork = {
  userId: string
  kind: string
  dedupeKey: string
  sourceKind: string
  sourceId: string
  calculationRevision: number
  state: string
  attempts: number
  generation: number
}

/** Transaction-local SQL adapter: verifies the actual minimal INSERT contract. */
export function detectionSqlAdapter(work: Map<string, DetectionWork>, failInsert: () => boolean = () => false): Pick<PrismaTx, "$queryRaw" | "$executeRaw"> {
  let savepoint: Map<string, DetectionWork> | undefined
  return {
    $executeRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("")
      if (sql.startsWith("SAVEPOINT")) savepoint = structuredClone(work)
      if (sql.startsWith("ROLLBACK TO")) {
        work.clear()
        for (const [key, value] of savepoint ?? []) work.set(key, value)
      }
      return 0
    },
    $queryRaw: async <T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> => {
      const sql = strings.join("?")
      assert.match(sql, /\(id, user_id, kind, dedupe_key, source_kind, source_id, calculation_revision, updated_at\)/)
      // An explicit conflict target requires SELECT on its columns, deliberately
      // denied by the canonical work ACL. Do not widen grants to make mocks pass.
      assert.match(sql, /ON CONFLICT DO NOTHING/)
      assert.match(sql, /RETURNING id\s*$/)
      assert.match(sql, /, 0, CURRENT_TIMESTAMP/)
      assert.equal(values.length, 5)
      const [id, userId, dedupeKey, sourceKind, sourceId] = values as string[]
      const key = `${userId}:detect:${dedupeKey}`
      if (failInsert()) throw new Error("mock work insert unavailable")
      if (work.has(key)) return [] as T
      work.set(key, { userId, kind: "detect", dedupeKey, sourceKind, sourceId, calculationRevision: 0, state: "pending", attempts: 0, generation: 0 })
      return [{ id }] as T
    },
  } as Pick<PrismaTx, "$queryRaw" | "$executeRaw">
}