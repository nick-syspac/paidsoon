import { after, before, beforeEach, mock, test } from "node:test"
import assert from "node:assert/strict"
import type { ReactElement } from "react"
import { getPublicPlans } from "@/lib/subscriptionPlans"
import { createBillingClientOperation, type BillingClientProps, type BillingRequest } from "@/lib/billing/clientOperation"

type Element = ReactElement<Record<string, unknown>>
let picker: typeof import("@/components/onboarding/OnboardingPlanPicker").OnboardingPlanPicker
let button: typeof import("@/components/billing/StartCheckoutButton").StartCheckoutButton
let slots: unknown[] = []
let cursor = 0
let storedPlan: string | null = null
let navigations: string[] = []
let calls: { path: string; init: RequestInit }[] = []
let response: () => Promise<Response> = async () => Response.json({ ok: true })
let controller: ReturnType<typeof createBillingClientOperation>
let fetchMock: ReturnType<typeof mock.method<typeof globalThis, "fetch">>
const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
const operationId = "96ea5264-fbe7-4d46-9086-e9244675c511"
before(async () => {
  const { default: actual, ...named } = await import("react")
  await mock.module("react", { defaultExport: actual, namedExports: { ...named,
    useState: (initial: unknown) => {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial
      return [slots[index], (next: unknown) => { slots[index] = typeof next === "function" ? next(slots[index]) : next }]
    },
  } })
  await mock.module("next/navigation", { namedExports: { useRouter: () => ({ push: (url: string) => { navigations.push(url) } }) } })
  await mock.module("@/components/billing/useBillingOperation", { namedExports: { useBillingOperation: (props: BillingClientProps) => ({
    state: controller.state(), loading: controller.state().busy,
    start: (request: BillingRequest) => controller.start(request, props.billingAccessVersion),
    check: () => controller.check(), reconcile: () => controller.reconcile(), beginNewIntent: () => controller.beginNewIntent(),
  }) } })
  await mock.module("@/components/billing/BillingOperationNotice", { namedExports: { BillingOperationNotice: () => null } })
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: () => storedPlan, removeItem: () => { storedPlan = null },
  } })
  fetchMock = mock.method(globalThis, "fetch", async (path, init) => { calls.push({ path: String(path), init: init ?? {} }); return response() })
  ;({ OnboardingPlanPicker: picker } = await import("@/components/onboarding/OnboardingPlanPicker"))
  ;({ StartCheckoutButton: button } = await import("@/components/billing/StartCheckoutButton"))
})
after(() => {
  fetchMock.mock.restore()
  if (localStorageDescriptor) Object.defineProperty(globalThis, "localStorage", localStorageDescriptor)
  else Reflect.deleteProperty(globalThis, "localStorage")
})
beforeEach(() => {
  slots = []; cursor = 0; storedPlan = null; navigations = []; calls = []
  response = async () => Response.json({ ok: true })
  const store = new Map<string, string>()
  controller = createBillingClientOperation({ scope: "test-session", storage: {
    getItem: (key) => store.get(key) ?? null, setItem: (key, value) => { store.set(key, value) }, removeItem: (key) => { store.delete(key) },
  }, fetch: globalThis.fetch, uuid: () => operationId, changed: () => {}, refresh: () => {}, success: () => {} })
})
function nodes(node: unknown): Element[] {
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (!node || typeof node !== "object" || !("props" in node)) return []
  const element = node as Element
  return [element, ...nodes(element.props.children)]
}
function text(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(text).join(" ")
  if (node && typeof node === "object" && "props" in node) return text((node as Element).props.children)
  return ""
}
function renderPicker(): Element { cursor = 0; return picker() }
function continueButton(tree: Element): Element { return nodes(tree).find((entry) => entry.type === "button" && /Continue to checkout|Continuing/.test(text(entry)))! }
async function click(element: Element): Promise<void> {
  assert.equal(element.type, "button")
  await (element.props.onClick as () => Promise<void> | void)()
}
for (const plan of getPublicPlans()) test(`actual picker selects ${plan.id}, completes once and navigates with intent, never Checkout POST`, async () => {
  const first = renderPicker()
  assert.equal(calls.length, 0)
  const choice = nodes(first).find((entry) => entry.type === "button" && text(entry).includes(plan.name))!
  await click(choice)
  await click(continueButton(renderPicker()))
  assert.deepEqual(navigations, [`/billing/checkout?plan=${plan.id}`])
  assert.equal(calls.length, 1); assert.equal(calls[0].path, "/api/onboarding"); assert.equal(calls[0].init.method, "PATCH")
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { tier: plan.id })
  assert.doesNotMatch(text(renderPicker()), /14.day|No credit card|Start free trial|Starting trial/i)
  assert.match(text(renderPicker()), /does not activate|unchanged/)
})
test("public preselection survives, hidden/invalid preselection defaults safely, with no dispatch on render", () => {
  for (const plan of [...getPublicPlans().map((entry) => entry.id), "accountant_partner", "invalid"]) {
    slots = []; storedPlan = plan
    renderPicker()
    assert.equal(slots[0], ["accountant_partner", "invalid"].includes(plan) ? "essentials" : plan)
    assert.equal(storedPlan, null)
  }
  assert.equal(calls.length, 0)
})
for (const failure of ["http", "network"] as const) test(`failed ${failure} completion stays on picker with safe feedback and no billing request`, async () => {
  response = failure === "http" ? async () => Response.json({ error: "private provider detail" }, { status: 503 }) : async () => { throw new Error("private network detail") }
  await click(continueButton(renderPicker()))
  assert.deepEqual(navigations, []); assert.equal(calls.length, 1); assert.equal(calls[0].path, "/api/onboarding")
  assert.match(text(renderPicker()), /try again/i); assert.doesNotMatch(text(renderPicker()), /private/)
})
test("completion loading disables continue and uses accurate continue wording, not a trial-start label", async () => {
  let release!: (value: Response) => void
  response = () => new Promise((resolve) => { release = resolve })
  const submitting = click(continueButton(renderPicker()))
  const loading = continueButton(renderPicker())
  assert.equal(loading.props.disabled, true); assert.match(text(loading), /Continuing/)
  release(Response.json({ ok: true })); await submitting
})
for (const plan of getPublicPlans()) test(`actual Checkout button for ${plan.id} dispatches only on explicit click with UUID/version and retains 202 recovery`, async () => {
  const pending = { operationId, status: "reconciliation_required", canReconcile: true, result: null }
  response = async () => Response.json(pending, { status: 202 })
  const props = { tier: plan.id, billingAccessVersion: 27, billingSessionScope: "test-session" }
  // Initial landing, refresh and cancel-return all render the same stable explicit action.
  for (let render = 0; render < 3; render++) button(props)
  assert.equal(calls.length, 0)
  const action = nodes(button(props)).find((entry) => entry.type === "button")!
  // StartCheckoutButton deliberately returns void; wait for the same in-flight controller.
  await click(action)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, "/api/billing/checkout"); assert.equal(calls[0].init.method, "POST")
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { tier: plan.id })
  assert.deepEqual(calls[0].init.headers, { "Content-Type": "application/json", "Idempotency-Key": operationId, "X-Billing-Access-Version": "27" })
  assert.equal(controller.state().phase, "pending"); assert.equal(controller.state().canReconcile, true)
  assert.match(controller.state().message ?? "", /does not confirm a charge/)
  button(props); assert.equal(calls.length, 1, "pending re-render must not retry POST")
  await controller.check(); assert.equal(calls[1].init.method, "GET")
  await controller.reconcile()
  assert.equal(calls[2].path, `/api/billing/operations/${operationId}/reconcile`)
  assert.equal(calls[2].init.body, "{}"); assert.equal(calls[2].init.method, "POST")
  assert.equal(controller.state().intent?.operationId, operationId)
})
test("actual Checkout button retains the same UUID after a lost response instead of automatically reposting", async () => {
  response = async () => { throw new Error("lost response") }
  const props = { tier: "business_pro", billingAccessVersion: 27, billingSessionScope: "test-session" }
  const action = nodes(button(props)).find((entry) => entry.type === "button")!
  await click(action); await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(calls.length, 1)
  button(props); assert.equal(calls.length, 1)
  await click(nodes(button(props)).find((entry) => entry.type === "button")!)
  await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(calls[1].init.method, "GET"); assert.equal(controller.state().intent?.operationId, operationId)
  assert.equal(calls.filter((call) => call.init.method === "POST").length, 1)
})