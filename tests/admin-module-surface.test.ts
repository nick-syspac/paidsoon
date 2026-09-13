import test from "node:test"
import assert from "node:assert/strict"

import { getAdminModuleSurface } from "@/lib/admin/moduleSurface"

test("admin module surface exposes the current operational modules with direct links", () => {
  const modules = getAdminModuleSurface()

  const hrefs = modules.map((module) => module.href)
  assert.ok(hrefs.includes("/admin/tenants"))
  assert.ok(hrefs.includes("/admin/subscriptions"))
  assert.ok(hrefs.includes("/admin/integrations"))
  assert.ok(hrefs.includes("/admin/customers"))
  assert.ok(hrefs.includes("/admin/email-jobs"))
  assert.ok(hrefs.includes("/admin/training"))
  assert.ok(hrefs.includes("/admin/runbooks"))

  const uniqueHrefs = new Set(hrefs)
  assert.equal(uniqueHrefs.size, hrefs.length)
  assert.ok(modules.every((module) => module.label && module.description && module.status))
})
