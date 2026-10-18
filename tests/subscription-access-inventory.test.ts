import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { test } from "node:test"
import ts from "typescript"

const root = resolve(import.meta.dirname, "..")
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
const productRoots = new Set([
  "arrangements", "cashplan", "commitguard", "cost-guard", "deposit-guard",
  "invoice-imports", "invoices", "margin-guard", "owners-digest", "runway-guard",
  "settings", "spend-classification", "spend-imports", "spend-insights", "spendleak", "tax-buffer",
])

// Explicit D7 exclusions; system execution is task 6, not authenticated customer
// entrypoints. A new unclassified API family must receive a deliberate decision.
const operationalRoots = new Set(["admin", "auth", "billing", "cron", "internal", "webhooks", "help"])
const exemptions = new Map([
  ["contact/route.ts", "public contact form"],
  ["promise/[token]/route.ts", "public debtor-token workflow"],
  ["diagnostics/db-check/route.ts", "separately authenticated operational diagnostics"],
  ["onboarding/route.ts", "onboarding/recovery; effective source limits belong to task 5.4"],
  ["settings/profile/route.ts", "account/profile recovery"],
  ["stripe/connect/disconnect/route.ts", "authenticated connection cleanup"],
  ["integrations/xero/disconnect/route.ts", "authenticated connection cleanup"],
  ["integrations/myob/disconnect/route.ts", "authenticated connection cleanup"],
  ["invoice-imports/mapping-profiles/[profileId]/route.ts", "authenticated saved-mapping cleanup"],
])
const aliases = new Map([
  ["settings/margin-guard/route.ts", "margin-guard/settings/route.ts"],
  ["settings/tax-buffer/route.ts", "tax-buffer/settings/route.ts"],
])
const cleanupMethods = new Map([
  ["settings/templates/route.ts", "DELETE"],
  ["deposit-guard/jobs/[jobId]/route.ts", "DELETE"],
  ["deposit-guard/milestones/[milestoneId]/route.ts", "DELETE"],
])
const actionScopedRoute = "deposit-guard/requests/[requestId]/route.ts"

function source(path: string): ts.SourceFile {
  return ts.createSourceFile(path, readFileSync(resolve(root, "app/api", path), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function exported(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && Boolean(ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
}

function protectedMethods(file: ts.SourceFile): string[] {
  const guarded: string[] = []
  assert.ok(file.statements.some((node) => ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier)
    && node.moduleSpecifier.text === "@/lib/billing/subscriptionRoute"
    && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
    && node.importClause.namedBindings.elements.some((name) => name.name.text === "withSubscriptionAccess")), file.fileName)
  for (const node of file.statements) {
    if (ts.isFunctionDeclaration(node) && exported(node) && node.name && methods.has(node.name.text)) {
      if (cleanupMethods.get(file.fileName) === node.name.text) continue
      if (file.fileName === actionScopedRoute && node.name.text === "POST") {
        assert.match(node.getText(file), /if \(parsedBody.data.action !== "cancel"\)/)
        assert.ok(node.getText(file).indexOf("await requireSubscriptionAccess(user.id)")
          < node.getText(file).indexOf("await sendDepositRequest("))
        assert.ok(node.getText(file).includes("await requireSubscriptionAccess(user.id)"))
        assert.ok(node.getText(file).includes("await resendDepositRequest("))
        continue
      }
      assert.fail(`${file.fileName}: ${node.name.text} bypasses centralized access`)
    }
    if (ts.isVariableStatement(node) && exported(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !methods.has(declaration.name.text)) continue
        const init = declaration.initializer
        assert.ok(init && ts.isCallExpression(init) && ts.isIdentifier(init.expression)
          && init.expression.text === "withSubscriptionAccess", `${file.fileName}: ${declaration.name.text}`)
        guarded.push(declaration.name.text)
      }
    }
    if (ts.isExportDeclaration(node)) {
      assert.fail(`${file.fileName}: review indirect HTTP exports explicitly`)
    }
  }
  assert.ok(guarded.length > 0, `${file.fileName}: no guarded HTTP methods found`)
  return guarded
}

test("D7 inventory covers every API file: 160 wrapped methods, one action-scoped guard, two guarded aliases and explicit cleanup", () => {
  const paths = readdirSync(resolve(root, "app/api"), { recursive: true })
    .filter((path): path is string => typeof path === "string" && path.endsWith("/route.ts"))
  let direct = 0; let methodCount = 0; let excluded = 0
  for (const path of paths) {
    const file = source(path)
    const family = path.split("/")[0]
    if (exemptions.has(path) || operationalRoots.has(family)) {
      excluded++
      assert.equal(file.text.includes("@/lib/billing/subscriptionRoute"), false, `${path}: must remain reachable without access`)
      assert.equal(file.text.includes("@/lib/billing/accessGuard"), false, `${path}: must not load subscription guard`)
      continue
    }
    const target = aliases.get(path)
    if (target) {
      assert.deepEqual(protectedMethods(source(target)), ["GET", "PUT"])
      assert.ok(file.text.includes(`@/app/api/${target.slice(0, -3)}`), `${path}: guarded delegation missing`)
      // The sole extra method is the pre-existing 405 compatibility response.
      if (path === "settings/margin-guard/route.ts") assert.match(file.text, /status: 405/)
      continue
    }
    assert.ok(productRoots.has(family)
      || /^integrations\/(xero|myob)\/(connect|callback|select-org|sync)\/route\.ts$/.test(path)
      || /^stripe\/connect\/(authorize|callback)\/route\.ts$/.test(path), `${path}: unclassified API entrypoint`)
    methodCount += protectedMethods(file).length
    direct++
  }
  assert.deepEqual({ total: paths.length, direct, methodCount, aliases: aliases.size, excluded }, {
    total: 213, direct: 127, methodCount: 160, aliases: 2, excluded: 84,
  })
})

test("mixed-method cleanup delegates retain RLS without inheriting effective feature denial", () => {
  for (const [path, method] of cleanupMethods) {
    const file = source(path)
    const handler = file.statements.find((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === method && exported(node))
    assert.ok(handler, `${path}: cleanup handler missing`)
    assert.match(handler.getText(file), /supabase.auth.getUser\(\)/)
    assert.doesNotMatch(handler.getText(file), /requireSubscriptionAccess|requireFeature|withSubscriptionAccess/)
  }
  for (const [path, name] of [
    ["lib/depositGuard/jobs.ts", "archiveDepositGuardJob"],
    ["lib/depositGuard/milestones.ts", "deleteDepositGuardMilestone"],
    ["lib/depositGuard/requests.ts", "cancelDepositRequest"],
  ]) {
    const file = ts.createSourceFile(path, readFileSync(resolve(root, path), "utf8"), ts.ScriptTarget.Latest, true)
    const handler = file.statements.find((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === name)
    assert.ok(handler, name)
    assert.match(handler.getText(file), /withUserContext\(userId/)
    assert.doesNotMatch(handler.getText(file), /require.*Access\(|requireFeature\(/)
  }
})

test("central boundary authenticates and resolves access before invoking product services; guard uses only the fresh RLS loader", () => {
  const route = readFileSync(resolve(root, "lib/billing/subscriptionRoute.ts"), "utf8")
  assert.ok(route.indexOf("supabase.auth.getUser()") < route.indexOf("await requireSubscriptionAccess(user.id)"))
  assert.ok(route.indexOf("await requireSubscriptionAccess(user.id)") < route.indexOf("return handler(...args)"))
  const guard = readFileSync(resolve(root, "lib/billing/accessGuard.ts"), "utf8")
  assert.match(guard, /await getEffectiveAccess\(userId\)/)
  assert.doesNotMatch(guard, /prismaAdmin|effectiveAccessSystem|DEFAULT_SUBSCRIPTION_TIER|unstable_cache/)
  assert.match(guard, /!access.allowAccess \|\| access.effectiveTier === null/)
})