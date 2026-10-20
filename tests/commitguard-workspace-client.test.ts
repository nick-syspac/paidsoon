import assert from "node:assert/strict"
import { test } from "node:test"
import { createWorkspaceStore } from "@/lib/commitguard/workspaceClient"
import { syntheticWorkspace } from "@/tests/helpers/commitGuardWorkspace"
import { selectWorkspaceCommitments } from "@/lib/commitguard/workspaceFilters"

function deferred() {
  let resolve!: (response: Response) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
test("7.2 publishes every section at once, rejecting mixed revisions and preserving prior snapshot on failure", async () => {
  let next = syntheticWorkspace(2)
  const initial = syntheticWorkspace()
  const store = createWorkspaceStore(initial, "status=paused", async (url, init) => {
    assert.equal(url, "/api/commitguard/workspace?status=paused"); assert.equal(init?.method, undefined)
    assert.equal(init?.cache, "no-store")
    return Response.json({ workspace: next })
  })
  store.beginMutation()
  next = { ...next, cashInputRevision: 99 }
  await assert.rejects(store.refresh(), /Invalid workspace/)
  assert.equal(store.getSnapshot().workspace, initial)
  assert.equal(store.getSnapshot().refreshFailed, true)
  store.adoptServer(syntheticWorkspace(3))
  assert.equal(store.getSnapshot().workspace, initial)
  next = syntheticWorkspace(2)
  next.upcoming = selectWorkspaceCommitments(next.commitments, { status: "paused" }, next.asOf)
  await store.refresh()
  assert.deepEqual(store.getSnapshot().workspace, next)
  assert.equal(store.getSnapshot().refreshFailed, false)
})
test("7.2 latest request wins even if an aborted old transport still resolves; stale server props cannot roll back", async () => {
  const requests = [deferred(), deferred()]
  const signals: Array<AbortSignal | null | undefined> = []
  let index = 0
  const store = createWorkspaceStore(syntheticWorkspace(), "", async (_url, init) => {
    signals.push(init?.signal); return requests[index++].promise
  })
  const first = store.refresh()
  const second = store.refresh()
  assert.equal(signals[0]?.aborted, true)
  requests[1].resolve(Response.json({ workspace: syntheticWorkspace(3) }))
  await second
  requests[0].resolve(Response.json({ workspace: syntheticWorkspace(2) }))
  await first
  store.adoptServer(syntheticWorkspace(1))
  assert.equal(store.getSnapshot().workspace.calculationRevision, 3)
})
test("7.2 mutation invalidates in-flight GET and blocks stale props until coherent retrieval", async () => {
  const pending = deferred()
  const initial = syntheticWorkspace()
  const store = createWorkspaceStore(initial, "", () => pending.promise)
  const read = store.refresh()
  store.beginMutation()
  store.adoptServer(syntheticWorkspace(2))
  pending.resolve(Response.json({ workspace: syntheticWorkspace(2) }))
  await read
  assert.equal(store.getSnapshot().workspace, initial)
  assert.equal(store.getSnapshot().refreshing, false)
})
test("7.2 refresh retry sends GET only and never repeats successful mutation", async () => {
  const methods: string[] = []
  let fail = true
  const store = createWorkspaceStore(syntheticWorkspace(), "", async (_url, init) => {
    methods.push(init?.method ?? "GET")
    return fail ? new Response(null, { status: 500 }) : Response.json({ workspace: syntheticWorkspace(2) })
  })
  store.beginMutation()
  await assert.rejects(store.refresh())
  fail = false
  await store.refresh()
  assert.deepEqual(methods, ["GET", "GET"])
})

test("7.2 shared writer guard blocks competing mutations and mid-write GET publication", async () => {
  const pending = deferred()
  const methods: string[] = []
  const store = createWorkspaceStore(syntheticWorkspace(), "", async (_url, init) => {
    methods.push(init?.method ?? "GET")
    return init?.method ? pending.promise : Response.json({ workspace: syntheticWorkspace(2) })
  })
  const write = store.requestMutation("/api/commitguard/commitments/one/actions", { method: "POST" })
  assert.equal(store.getSnapshot().mutating, true)
  await assert.rejects(store.requestMutation("/api/commitguard/cash-context", { method: "PUT" }), /before another mutation/)
  await assert.rejects(store.refresh(), /current mutation/)
  store.adoptServer(syntheticWorkspace(3))
  assert.equal(store.getSnapshot().workspace.calculationRevision, 1)
  pending.resolve(Response.json({ status: "updated" }))
  await write
  assert.equal(store.getSnapshot().mutating, false)
  await store.refresh()
  assert.deepEqual(methods, ["POST", "GET"])
  assert.equal(store.getSnapshot().workspace.calculationRevision, 2)
})

test("7.2 rejects inconsistent copied cash/settings/count/clock sections without publishing them", async () => {
  for (const corrupt of [
    (dto: ReturnType<typeof syntheticWorkspace>) => { dto.cashContext = { ...dto.cashContext, amountCents: 1 } },
    (dto: ReturnType<typeof syntheticWorkspace>) => { dto.settings = { ...dto.settings, enabled: false } },
    (dto: ReturnType<typeof syntheticWorkspace>) => { dto.reviewCount = 10 },
    (dto: ReturnType<typeof syntheticWorkspace>) => { dto.asOf = "2026-10-20T00:00:00Z" },
  ]) {
    const initial = syntheticWorkspace()
    const next = syntheticWorkspace(2)
    corrupt(next)
    const store = createWorkspaceStore(initial, "", async () => Response.json({ workspace: next }))
    await assert.rejects(store.refresh(), /Invalid workspace/)
    assert.equal(store.getSnapshot().workspace, initial)
  }
})

test("7.3 client rejects stale or missing filtered selection instead of mixing matching rows with a different URL", async () => {
  for (const corrupt of [
    (dto: ReturnType<typeof syntheticWorkspace>) => { dto.upcoming.total = 999 },
    (dto: ReturnType<typeof syntheticWorkspace>) => { dto.upcoming.items = [] },
  ]) {
    const initial = syntheticWorkspace()
    const next = syntheticWorkspace(2)
    corrupt(next)
    const store = createWorkspaceStore(initial, "", async () => Response.json({ workspace: next }))
    await assert.rejects(store.refresh(), /Invalid workspace selection/)
    assert.equal(store.getSnapshot().workspace, initial)
    assert.equal(store.getSnapshot().refreshFailed, true)
  }
})