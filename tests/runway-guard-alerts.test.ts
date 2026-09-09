import test from "node:test"
import assert from "node:assert/strict"

import {
  defaultRunwayGuardPolicy,
  evaluateRunwayAlertTransition,
  evaluateRunwayMaterialChange,
} from "@/lib/runwayGuard/foundation"

test("threshold transitions detect breach and recovery events", () => {
  const breach = evaluateRunwayAlertTransition({
    previousRunwayDays: 180,
    currentRunwayDays: 60,
    policy: defaultRunwayGuardPolicy,
  })

  const recovery = evaluateRunwayAlertTransition({
    previousRunwayDays: 40,
    currentRunwayDays: 120,
    policy: defaultRunwayGuardPolicy,
  })

  assert.equal(breach.event, "breach")
  assert.equal(recovery.event, "recovery")
  assert.ok(breach.message.toLowerCase().includes("breach"))
  assert.ok(recovery.message.toLowerCase().includes("recovery"))
})

test("material-change logic identifies decline and deduplicates repeated events", () => {
  const change = evaluateRunwayMaterialChange({
    previousRunwayDays: 180,
    currentRunwayDays: 60,
    previousProtectedCashCents: 250_000,
    currentProtectedCashCents: 500_000,
    policy: defaultRunwayGuardPolicy,
  })

  assert.equal(change.hasMaterialChange, true)
  assert.equal(change.severity, "warning")
  assert.ok(change.reason.toLowerCase().includes("decline"))
  assert.ok(change.dedupeKey.includes("runway-guard"))
})
