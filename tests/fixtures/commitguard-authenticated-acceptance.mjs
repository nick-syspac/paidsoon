// Replay through browser tools against a FRESH isolated 9.3 harness, in order:
// cash, recurrence, candidates, pagination, mutations, mobile, controls, readonly.
// The fixture serves this source for execution with the browser's Playwright
// page object. No browser fetch interception, fake persistence or remote URLs.
export default async function acceptance(page, phase) {
  const results = []
  const check = (ok, label) => { if (!ok) throw Error(`${phase}: ${label}; passed ${results.length}`); results.push(label) }
  const api = (path, method = "GET", body) => page.evaluate(async ({ path, method, body }) => {
    const response = await fetch(path, { method, ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json() }
  }, { path, method, body })
  const workspace = async () => { const r = await api("/api/commitguard/workspace"); if (r.status !== 200) throw Error(JSON.stringify(r)); return r.body.workspace }
  const evidence = async () => (await api("/fixture/evidence")).body
  const date = (await evidence()).date
  const day = n => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
  const ready = async () => {
    await page.locator("[data-workspace-revision]").waitFor()
    await page.getByRole("button", { name: "Save cash inputs", exact: true }).waitFor({ state: "visible" })
  }
  const navigate = async (query = "") => { await page.goto(`http://127.0.0.1:4193/dashboard/commitguard${query}`); await ready() }
  const settle = async () => {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].filter(e => ["Save cash inputs", "Saving…", "Saving..."].includes(e.textContent.trim())).every(e => !e.disabled))
    const w = await workspace()
    await page.waitForFunction(revision => document.querySelector("[data-workspace-revision]")?.getAttribute("data-workspace-revision") === String(revision), w.calculationRevision)
    await page.waitForFunction(() => ![...document.querySelectorAll('[role="status"]')].some(e => e.textContent.includes("Refreshing all CommitGuard")))
    return w
  }
  const money = (cents, currency) => cents == null ? "Not available" : new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase(), currencyDisplay: "code", minimumFractionDigits: 2 }).format(cents / 100)
  const coherent = async label => {
    const w = await settle()
    const display = page.locator("[data-calculation-revision]")
    check(await display.getAttribute("data-calculation-revision") === String(w.calculationRevision), `${label}: shared financial revision`)
    const cards = display.locator(":scope > div").nth(1).locator(":scope > div")
    check(await cards.count() === 4, `${label}: four hero cards retained`)
    check((await cards.nth(0).innerText()).includes(money(w.cashContext.amountCents, w.cashContext.currency)), `${label}: cash hero matches saved service DTO`)
    check((await cards.nth(3).innerText()).includes(money(w.summary.freeCash.freeCashCents, w.summary.freeCash.currency)), `${label}: free-cash hero matches service`)
    for (const group of w.summary.horizonsByCurrency) {
      const text = await page.getByRole("region", { name: `${group.currency.toUpperCase()} commitment horizons`, exact: true }).innerText()
      check(group.horizons.every(h => text.includes(money(h.totalCents, group.currency))), `${label}: ${group.currency} all four horizons refreshed`)
    }
    check((await page.locator("#commitguard-upcoming").innerText()).includes(`${w.upcoming.total} matching commitments`), `${label}: upcoming matches committed state`)
    check((await page.locator("#commitguard-renewals").innerText()).includes(`${w.summary.renewals.length} renewals`), `${label}: renewal total matches committed state`)
    check(await page.getByText(`Detected commitments ${w.reviewCount}`, { exact: true }).count() === 1, `${label}: review count refreshed`)
    return w
  }
  const saveCash = async (amount, balanceDate = date, currency = "aud") => {
    await page.getByLabel("Gross cash balance amount", { exact: true }).fill(amount)
    await page.getByLabel("Cash balance currency", { exact: true }).selectOption(currency)
    await page.getByLabel("Balance as of (UTC)", { exact: true }).fill(balanceDate)
    const response = page.waitForResponse(r => r.url().endsWith("/api/commitguard/cash-context") && r.request().method() === "PUT")
    await page.getByRole("button", { name: "Save cash inputs", exact: true }).click()
    check((await response).status() === 200, `cash ${amount}/${balanceDate}: actual PUT succeeded`)
    await page.waitForFunction(() => !document.querySelector('#cash-inputs button[type="submit"]')?.disabled)
    return coherent(`cash ${amount}/${balanceDate}`)
  }
  const create = async (input) => {
    const r = await api("/api/commitguard/commitments", "POST", { name: "Synthetic recurrence", category: "test", amountCents: 100, currency: "aud", frequency: "monthly", ...input })
    check(r.status === 201, `${input.name}: actual route/service create`)
    return r.body.commitment
  }
  await ready()
  if (phase === "cash") {
    let w = await coherent("initial missing")
    check(w.cashContext.amountCents === null && w.summary.freeCash.status === null, "missing cash is null, not WATCH")
    w = await saveCash("0")
    check(w.cashContext.amountCents === 0 && w.summary.quality.state === "complete", "explicit zero persists, complete not missing")
    w = await saveCash("-12.34")
    check(w.cashContext.amountCents === -1234 && w.summary.freeCash.status === "shortfall", "negative amount persists and shortfall uses text")
    w = await saveCash("10000", day(-7))
    check(w.cashContext.freshness === "fresh" && w.summary.freeCash.status !== null, "day seven remains actionable")
    w = await saveCash("10000", day(-8))
    check(w.cashContext.freshness === "stale" && w.summary.freeCash.freeCashCents === null && w.summary.freeCash.status === null, "day eight visible but non-actionable")
    check(await page.getByRole("button", { name: "Update stale cash balance" }).count() === 1, "stale update action accessible")
    await saveCash("10000")
    await page.getByRole("button", { name: "Clear balance fields", exact: true }).click()
    const clear = page.waitForResponse(r => r.url().endsWith("/cash-context") && r.request().method() === "PUT")
    await page.getByRole("button", { name: "Save cash inputs", exact: true }).click(); check((await clear).status() === 200, "clear actual PUT succeeds")
    w = await coherent("cleared")
    check(w.cashContext.amountCents === null && w.summary.freeCash.status === null && w.commitments.length === 32, "clear does not erase commitments or fabricate risk")
    await navigate(); await saveCash("10000")
    const before = await evidence()
    const invalid = await api("/api/commitguard/cash-context", "PUT", { expectedRevision: 0, amountCents: 5, currency: "aud", balanceAsOf: date })
    check(invalid.status === 409, "stale expected revision rejected by actual service")
    const foreign = await api(`/api/commitguard/commitments/${before.foreignId}`, "PATCH", { name: "Forbidden" })
    check(foreign.status === 404, "foreign tenant mutation indistinguishable from missing")
    check(JSON.stringify((await evidence()).fingerprint) === JSON.stringify(before.fingerprint), "409/foreign rejection leave complete ledger unchanged")
  }
  if (phase === "recurrence") {
    const base = await workspace()
    const mixed = await create({ name: "Synthetic USD partition", currency: "usd", frequency: "one_off", amountCents: 9999, nextDueDate: day(1) })
    await navigate(); let w = await coherent("mixed currencies")
    check(w.summary.horizons === null && w.summary.freeCash.status === null, "mixed currencies suppress aggregate and safety assertion")
    check(w.summary.horizonsByCurrency.find(g => g.currency === "usd").horizons.find(h => h.days === 30).totalCents === 9999, "USD cents remain separate")
    check(w.summary.horizonsByCurrency.find(g => g.currency === "aud").horizons.find(h => h.days === 30).totalCents === base.summary.horizonsByCurrency[0].horizons.find(h => h.days === 30).totalCents, "AUD total not contaminated by USD")
    await api(`/api/commitguard/commitments/${mixed.id}/actions`, "POST", { action: "pause" })
    const old = await create({ name: "Synthetic old weekly anchor", frequency: "weekly", nextDueDate: "2000-01-03" })
    w = await workspace()
    const delta = w.summary.horizonsByCurrency[0].horizons.find(h => h.days === 7).totalCents - base.summary.horizonsByCurrency[0].horizons.find(h => h.days === 7).totalCents
    check(delta === 100, "actual engine skips >250 historical weeks and emits one seven-day occurrence")
    await api(`/api/commitguard/commitments/${old.id}/actions`, "POST", { action: "pause" })
    const month = await create({ name: "Synthetic month end anchor", nextDueDate: "2020-01-31" })
    w = await workspace()
    const expected = [7, 30, 60, 90].map(days => {
      let n = 0; const start = Date.parse(date), end = start + days * 86400000
      for (let k = 0; k < 4; k++) { const d = new Date(`${date}T00:00:00Z`); const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k + 1, 0); if (t >= start && t < end) n++ }
      return n * 100
    })
    check(w.summary.horizonsByCurrency[0].horizons.every((h, i) => h.totalCents - base.summary.horizonsByCurrency[0].horizons[i].totalCents === expected[i]), "month-end anchor independent calendar oracle across four horizons")
    await api(`/api/commitguard/commitments/${month.id}/actions`, "POST", { action: "pause" })
    const unscheduled = await create({ name: "Synthetic null schedule", nextDueDate: null })
    await navigate(); w = await coherent("null schedule")
    check(w.summary.freeCash.status === null && w.summary.quality.reasons.includes("missing_next_due_date"), "null recurrence input produces incomplete, never one-off")
    const legacy = w.commitments.find(c => c.name === "Synthetic legacy custom")
    await api(`/api/commitguard/commitments/${legacy.id}/actions`, "POST", { action: "resume" })
    await navigate(); check((await page.locator(`#commitment-${legacy.id}`).innerText()).includes("Unsupported custom recurrence"), "legacy custom visibly requires repair")
    await page.locator(`#commitment-${legacy.id}`).getByRole("button", { name: "Edit", exact: true }).click()
    const editor = page.locator("#commitguard-editor")
    check(await editor.getByLabel("Edit commitment frequency", { exact: true }).locator('option[value="custom"]').count() === 1, "legacy custom retained only as unchanged option")
    await editor.getByLabel("Edit commitment frequency", { exact: true }).selectOption("monthly")
    await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await editor.waitFor({ state: "detached" }); await settle()
    check((await workspace()).commitments.find(c => c.id === legacy.id).frequency === "monthly", "real UI supported recurrence repair persists")
    await api(`/api/commitguard/commitments/${unscheduled.id}`, "PATCH", { nextDueDate: day(3) })
    const invalid = await api("/api/commitguard/commitments", "POST", { name: "Bad custom", category: "test", amountCents: 100, currency: "aud", frequency: "custom" })
    check(invalid.status === 400, "new custom route rejects unsupported write")
    await navigate(); check((await coherent("repaired schedules")).summary.quality.state === "complete", "supported schedule repairs restore complete figures")
  }
  if (phase === "candidates") {
    const candidate = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Synthetic candidate correction", exact: true }) })
    await candidate.getByRole("button", { name: "Edit candidate", exact: true }).click()
    const form = page.getByRole("form", { name: "Edit detected candidate", exact: true })
    await form.getByLabel("Candidate name", { exact: true }).fill("Synthetic corrected candidate")
    await form.getByLabel("Candidate category", { exact: true }).fill("insurance")
    await form.getByLabel("Candidate amount (source currency)", { exact: true }).fill("45.67")
    await form.getByLabel("Candidate suggested due date (UTC)", { exact: true }).fill(day(4))
    await form.getByRole("combobox", { name: "Candidate frequency", exact: true }).selectOption("weekly")
    await form.getByRole("combobox", { name: "Candidate confidence", exact: true }).selectOption("high")
    await form.getByRole("button", { name: "Save candidate", exact: true }).click(); await form.waitFor({ state: "detached" })
    let w = await coherent("candidate edit")
    let c = w.candidates.find(c => c.name === "Synthetic corrected candidate")
    check(c.typicalAmountCents === 4567 && c.frequency === "weekly" && c.category === "insurance" && c.confidence === "high" && c.suggestedDueDate === day(4), "all corrected candidate fields persisted by actual service")
    const article = page.locator(`#detection-${c.id}`)
    await article.getByRole("button", { name: "Ignore", exact: true }).click(); w = await coherent("candidate ignore")
    check(w.candidates.find(row => row.id === c.id).status === "ignored", "ignore persists and pending count falls")
    await page.getByLabel("Review queue view").selectOption("ignored")
    await page.locator(`#detection-${c.id}`).getByRole("button", { name: "Edit candidate" }).click()
    await form.getByLabel("Candidate name", { exact: true }).fill("Synthetic deliberately reopened")
    await form.getByRole("button", { name: "Save candidate", exact: true }).click(); await form.waitFor({ state: "detached" })
    w = await coherent("candidate reopen")
    check(w.candidates.find(row => row.id === c.id).status === "pending", "explicit edit reopens ignored candidate")
    await page.getByLabel("Review queue view").selectOption("pending")
    await page.locator(`#detection-${c.id}`).getByRole("button", { name: "Confirm", exact: true }).dblclick()
    w = await coherent("candidate UI confirm")
    check(w.commitments.some(row => row.name === "Synthetic deliberately reopened" && row.amountCents === 4567 && row.frequency === "weekly"), "UI double-click converts corrected fields once")
    const e = await evidence()
    const responses = await page.evaluate(async id => Promise.all(Array.from({ length: 4 }, async () => {
      const r = await fetch(`/api/commitguard/detections/${id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm" }) }); return { status: r.status, body: await r.json() }
    })), e.duplicateId)
    check(responses.every(r => r.status === 200), "four actual concurrent browser confirmation HTTP requests succeed")
    const retried = await api(`/api/commitguard/detections/${e.duplicateId}/review`, "POST", { action: "confirm" })
    check(retried.status === 200, "sequential confirmation retry succeeds")
    const after = await evidence()
    check(after.conversions.filter(r => r.sourceDetectionCandidateId === e.duplicateId).length === 1 && after.conversionEvents === 2, "exactly one commitment/conversion audit per candidate after repeated concurrent requests")
    const rejected = await api(`/api/commitguard/detections/${e.duplicateId}/review`, "POST", { action: "ignore" })
    check(rejected.status === 409, "converted candidate cannot reopen or ignore")
    const race = await api("/fixture/race", "POST")
    check(race.status === 200 && race.body.blockedSessions === 2 && race.body.before === 149 && race.body.after === 150, "true PostgreSQL final-slot race: two blocked sessions, only one commit")
    check(race.body.statuses.includes(403) && race.body.statuses.some(s => s === 200 || s === 201), "real manual/conversion handlers enforce unchanged allowance error")
    await navigate(); await coherent("duplicate conversion refresh")
  }
  if (phase === "pagination") {
    await navigate("?source=import&sortBy=name&sortOrder=asc")
    const seen = []
    for (let p = 1; p <= 3; p++) {
      const w = await workspaceFromUrl()
      const rows = await page.locator("#commitguard-upcoming tbody tr").allTextContents()
      check(rows.length === w.upcoming.items.length && w.upcoming.page === p, `matching page ${p}: actual filtered DTO matches rendered rows`)
      seen.push(...w.upcoming.items.map(r => r.id))
      if (p < 3) { const next = page.getByRole("link", { name: "Next commitments", exact: true }); await next.focus(); await page.keyboard.press("Enter"); await ready() }
    }
    check(new Set(seen).size === seen.length && seen.length > 24, "keyboard pagination reaches >12 without duplicates")
    check(page.url().includes("source=import") && page.url().includes("sortBy=name"), "pagination preserves source and sorting")
    await page.getByRole("form", { name: "Commitment filters" }).locator('select[name="category"]').selectOption("insurance")
    await page.getByRole("button", { name: "Apply filters", exact: true }).click(); await ready()
    check(!/[?&]page=/.test(page.url()), "filter application resets page")
    check((await workspaceFromUrl()).upcoming.items.every(r => r.category === "insurance"), "category filtered before pagination")
    await navigate("?source=import&category=software&page=999999&sortBy=name&sortOrder=desc")
    const clamped = await workspaceFromUrl(); check(clamped.upcoming.page === clamped.upcoming.totalPages, "out-of-range integer page clamps")
    await navigate("?search=definitely-no-synthetic-match")
    check((await page.locator("#commitguard-upcoming").innerText()).includes("No commitments match these filters"), "usable no-match state")
    await navigate("?source=import&sortBy=name&renewalPage=1")
    const renewals = []
    for (let p = 1; p <= 3; p++) {
      const ids = await page.locator("[data-renewal-id]").evaluateAll(es => es.map(e => e.getAttribute("data-renewal-id")))
      check(ids.length === (p < 3 ? 8 : 3), `renewal page ${p}: 8/8/3 visible`); renewals.push(...ids)
      if (p < 3) { const next = page.getByRole("link", { name: "Next renewals", exact: true }); await next.focus(); await page.keyboard.press("Enter"); await ready() }
    }
    check(new Set(renewals).size === 19 && page.url().includes("source=import"), "all 19 renewals reachable by keyboard with preserved filters")
    await navigate()
  }
  async function workspaceFromUrl() { const query = await page.evaluate(() => location.search); const r = await api(`/api/commitguard/workspace${query}`); if (r.status !== 200) throw Error(JSON.stringify(r)); return r.body.workspace }
  if (phase === "mutations") {
    let w = await workspace(); const row = w.commitments.find(r => r.name === "Synthetic record 00")
    const lifecycle = page.locator(`#commitment-${row.id}`)
    await lifecycle.getByRole("button", { name: "Pause", exact: true }).click(); w = await coherent("pause")
    check(w.commitments.find(c => c.id === row.id).status === "paused" && !w.summary.renewals.some(r => r.commitmentId === row.id), "pause removes upcoming protection and renewal")
    await lifecycle.getByRole("button", { name: "Resume", exact: true }).click(); w = await coherent("resume")
    check(w.commitments.find(c => c.id === row.id).status === "active", "resume restored current state")
    await lifecycle.getByRole("button", { name: "Edit", exact: true }).click()
    const editor = page.locator("#commitguard-editor")
    check(await editor.evaluate(el => el === document.activeElement), "editor receives keyboard focus")
    await editor.getByLabel("Edit commitment renewal date (utc)", { exact: true }).fill(day(4))
    await editor.getByLabel("Edit commitment notice period (days)", { exact: true }).fill("1")
    await editor.getByLabel("Edit commitment auto-renews", { exact: true }).selectOption("false")
    await editor.getByLabel("Edit commitment essentiality", { exact: true }).selectOption("critical")
    await editor.getByLabel("Edit commitment confidence", { exact: true }).selectOption("low")
    await editor.getByRole("button", { name: "Save changes", exact: true }).click(); await editor.waitFor({ state: "detached" }); w = await coherent("renewal/classification edit")
    const updated = w.commitments.find(r => r.id === row.id)
    check(updated.noticePeriodDays === 1 && !updated.autoRenew && updated.essentiality === "critical" && updated.confidence === "low", "renewal and classification actual persistence")
    check(w.summary.renewals.find(r => r.commitmentId === row.id).severity === "urgent", "renewal severity recomputed from edited notice date")
    check((await page.locator(`[data-renewal-id="${row.id}"]`).innerText()).includes("Auto-renews: No"), "renewal context refreshed without reload")
    const audits = (await evidence()).audits.filter(a => a.commitmentId === row.id)
    check(JSON.stringify(audits).includes("noticePeriodDays") && JSON.stringify(audits).includes("autoRenew") && JSON.stringify(audits).includes("essentiality"), "actual PostgreSQL changed-field audit contains renewal/classification")
    check(await lifecycle.getByRole("button", { name: "Edit", exact: true }).evaluate(el => el === document.activeElement), "editor close restores trigger focus")
    const initial = await evidence()
    await api("/fixture/fail-next-workspace", "POST")
    await lifecycle.getByRole("button", { name: "Pause", exact: true }).click()
    await page.getByRole("button", { name: "Retry workspace refresh (GET only)", exact: true }).waitFor()
    check((await page.getByRole("alert").first().innerText()).includes("Save succeeded"), "save-success/read-failure clearly distinguished")
    const committed = await evidence(); check(committed.counts.events === initial.counts.events + 1, "save persisted once before failing refresh")
    const start = committed.traffic.length
    await page.getByRole("button", { name: "Retry workspace refresh (GET only)", exact: true }).click()
    await page.getByRole("button", { name: "Retry workspace refresh (GET only)", exact: true }).waitFor({ state: "detached" })
    w = await coherent("GET-only recovery")
    const retry = await evidence()
    check(retry.traffic.slice(start).every(r => r.method === "GET") && JSON.stringify(retry.fingerprint) === JSON.stringify(committed.fingerprint), "retry uses GET only, no repeated write/audit/work")
    await lifecycle.getByRole("button", { name: "Resume", exact: true }).click(); await coherent("post-retry mutation")
    await lifecycle.getByRole("button", { name: "Cancel", exact: true }).click(); w = await coherent("cancel")
    check(w.commitments.find(c => c.id === row.id).status === "cancelled", "cancel persists without future contribution")
    check((await api(`/api/commitguard/commitments/${row.id}/actions`, "POST", { action: "resume" })).status === 409, "cancelled resume rejected by actual route")
    // Separate actual settings component has the fixture router adapter, not RSC.
    const settings = page.locator("#settings")
    const selects = await settings.locator("select").evaluateAll(es => es.map(e => ({ id: e.id, labels: [...e.labels].map(l => l.textContent), values: [...e.options].map(o => o.value) })))
    check(selects.length > 0, "actual settings controls available")
  }
  if (phase === "mobile") {
    await page.setViewportSize({ width: 375, height: 812 }); await navigate()
    const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
    check(dimensions.document <= 375 && dimensions.viewport === 375, "375px document has no horizontal overflow")
    const scroll = page.getByRole("region", { name: "Matching commitments", exact: true })
    check(await scroll.getAttribute("tabindex") === "0", "wide table scroll region is keyboard reachable")
    const unlabeled = await page.locator('input:not([type="hidden"]),select,textarea').evaluateAll(es => es.filter(e => !(e.labels?.length || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby"))).map(e => e.outerHTML))
    check(unlabeled.length === 0, "every rendered input/select/textarea has an accessible label")
    const positive = await page.locator('[tabindex]').evaluateAll(es => es.filter(e => Number(e.getAttribute("tabindex")) > 0).length)
    check(positive === 0, "no positive tabindex")
    const amount = page.getByLabel("Gross cash balance amount", { exact: true }); await amount.focus(); await page.keyboard.press("Tab")
    check(await page.getByLabel("Cash balance currency", { exact: true }).evaluate(e => e === document.activeElement), "cash amount to currency follows keyboard order")
    const row = (await workspace()).commitments.find(r => r.name === "Synthetic record 01")
    const edit = page.locator(`#commitment-${row.id}`).getByRole("button", { name: "Edit", exact: true }); await edit.focus(); await page.keyboard.press("Enter")
    check(await page.locator("#commitguard-editor").evaluate(e => e === document.activeElement), "keyboard Enter opens/focuses editor on mobile")
    const editorWidth = await page.locator("#commitguard-editor").evaluate(e => e.getBoundingClientRect().right)
    check(editorWidth <= 375, "editor fits 375px viewport")
    await page.getByRole("button", { name: "Cancel edit", exact: true }).click()
    check(await edit.evaluate(e => e === document.activeElement), "mobile cancel restores keyboard focus")
    await coherent("mobile complete workspace")
  }
  if (phase === "controls") {
    await navigate()
    const before = await evidence()
    const form = page.locator('form').filter({ has: page.getByRole("button", { name: "Add commitment", exact: true }) })
    await form.getByLabel("Name", { exact: true }).fill("Synthetic browser manual create")
    await form.getByLabel("Amount (A$)", { exact: true }).fill("25")
    await form.locator('select').selectOption("monthly")
    await form.getByLabel("Next due date", { exact: true }).fill(day(45))
    const created = page.waitForResponse(r => r.url().endsWith("/api/commitguard/commitments") && r.request().method() === "POST")
    await form.getByRole("button", { name: "Add commitment", exact: true }).click()
    check((await created).status() === 201, "manual create: actual browser form POST")
    let w = await coherent("manual create")
    check(w.commitments.some(c => c.name === "Synthetic browser manual create" && c.amountCents === 2500), "manual create: saved row present in refreshed DTO")
    check((await evidence()).counts.commitments === before.counts.commitments + 1, "manual create: exactly one persisted row")
    const settings = page.locator("#settings")
    const saveSettings = async label => {
      const saved = page.waitForResponse(r => r.url().endsWith("/api/commitguard/settings") && r.request().method() === "PUT")
      await settings.getByRole("button", { name: "Save settings", exact: true }).click()
      check((await saved).status() === 200, `${label}: actual settings PUT`)
      await settings.getByRole("button", { name: "Save settings", exact: true }).waitFor()
      return coherent(label)
    }
    await settings.locator('select[name="defaultHorizonDays"]').selectOption("60")
    w = await saveSettings("60-day settings refresh")
    check(w.settings.defaultHorizonDays === 60 && w.summary.selectedHorizonDays === 60 && w.summary.freeCash.committedCashCents > 0, "saved horizon updates protection without navigation")
    await page.getByLabel("Weekly operating expenses amount", { exact: true }).fill("200")
    await page.getByLabel("Weekly expense currency", { exact: true }).selectOption("aud")
    await page.getByLabel("Weekly expenses as of (UTC)", { exact: true }).fill(date)
    await saveCash("10000")
    await settings.locator('select[name="safetyBufferMode"]').selectOption("weeks_operating_expenses")
    await settings.locator('input[name="safetyBufferWeeks"]').fill("4")
    w = await saveSettings("weeks-based settings refresh")
    check(w.summary.freeCash.safetyBufferCents === 80000, "four weeks times 20000 cents protects 80000 cents")
    w = await saveCash("10000", date, "usd")
    check(w.cashContext.weeklyExpensesCurrency === "aud" && w.summary.freeCash.status === null, "cash currency change retains AUD expense basis and suppresses mismatched safety")
    await saveCash("10000", date, "aud")
    await settings.locator('select[name="safetyBufferMode"]').selectOption("fixed_amount")
    await settings.locator('select[name="defaultHorizonDays"]').selectOption("30")
    await saveSettings("restored policy refresh")
  }
  if (phase === "readonly") {
    const before = await evidence()
    for (const path of ["workspace", "cash-context", "summary", "timeline", "commitments", "settings"]) {
      check((await api(`/api/commitguard/${path}`)).status === 200, `GET ${path}: actual authenticated route`)
    }
    const after = await evidence()
    check(JSON.stringify(before.fingerprint) === JSON.stringify(after.fingerprint), "all GETs preserve row counts/content including audit/work/evaluation/snapshots")
    check(after.authCalls > before.authCalls, "actual routes call server-side synthetic getUser")
    const foreign = await api(`/api/commitguard/commitments/${before.foreignId}`, "PATCH", { name: "Forbidden synthetic edit" })
    const missing = await api("/api/commitguard/commitments/missing-synthetic-id", "PATCH", { name: "Forbidden synthetic edit" })
    check(foreign.status === 404 && missing.status === 404, "foreign and nonexistent rows both return 404")
    check(JSON.stringify(foreign.body) === JSON.stringify(missing.body), "foreign response shape reveals no row existence")
    check(!(await workspace()).commitments.some(c => c.id === before.foreignId), "foreign commitment absent from owner workspace")
    check(JSON.stringify((await evidence()).fingerprint) === JSON.stringify(after.fingerprint), "foreign and missing probes preserve complete ledger")
    await page.getByRole("button", { name: "End synthetic session", exact: true }).click()
    const endpoints = ["workspace", "cash-context", "commitments", "settings", "summary", "timeline"]
    for (const path of endpoints) check((await api(`/api/commitguard/${path}`)).status === 401, `missing cookie GET ${path}: 401`)
    check((await api("/api/commitguard/commitments", "POST", {})).status === 401, "missing cookie POST: 401 before data access")
    // The integrated browser does not implement CDP Storage.setCookies. This
    // forged, non-secret fixture cookie can be set through the real page.
    await page.evaluate(() => { document.cookie = "paidsoon_synthetic_93=forged-other-tenant; Path=/; SameSite=Strict" })
    check((await api("/api/commitguard/workspace")).status === 401, "unrecognized fixture cookie never authenticates")
    await page.getByRole("button", { name: "Start synthetic session", exact: true }).click(); await ready()
  }
  return { phase, assertions: results.length, results }
}