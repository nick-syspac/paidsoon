import "./_loadEnv"
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

const u = new URL(process.env.DIRECT_URL!)
const baseEnv = {
  ...process.env,
  PGHOST: u.hostname,
  PGPORT: u.port,
  PGDATABASE: u.pathname.slice(1),
  PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PATH: "/opt/homebrew/opt/libpq/bin:" + process.env.PATH,
}
const q = (sql: string) => execFileSync("psql", ["-tAc", sql], { env: baseEnv }).toString().trim()

const sql = readFileSync("prisma/rls-policies.sql", "utf8")
const filePolicies = new Set<string>()
for (const m of sql.matchAll(/CREATE OR REPLACE POLICY "([^"]+)"\s*(?:\n\s*)?ON (\w+)/g)) {
  filePolicies.add(`${m[2]}|${m[1]}`)
}

const serverPolicies = new Set(
  q("SELECT c.relname || '|' || p.polname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'").split("\n").filter(Boolean)
)
console.log(`file policies: ${filePolicies.size}, server policies: ${serverPolicies.size}`)
const missing = [...filePolicies].filter((k) => !serverPolicies.has(k))
console.log(`missing on server (${missing.length}):`)
for (const k of missing) console.log("  " + k)

const fileTables = [...new Set([...filePolicies].map((k) => k.split("|")[0]))].sort()
const rlsRows = q(`SELECT relname || '|' || relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN (${fileTables.map((t) => `'${t}'`).join(",")})`).split("\n")
const disabled = rlsRows.filter((r) => r.endsWith("|f")).map((r) => r.split("|")[0])
console.log(`RLS disabled (${disabled.length}): ${disabled.join(", ") || "none"}`)
const existing = new Set(rlsRows.map((r) => r.split("|")[0]))
const noTable = fileTables.filter((t) => !existing.has(t))
if (noTable.length) console.log(`TABLE MISSING: ${noTable.join(", ")}`)
