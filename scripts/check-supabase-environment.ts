import { readFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { scanSupabaseDrift } from "@/lib/config/supabaseDrift"

async function main(): Promise<void> {
  const tracked = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  if (tracked.status !== 0) {
    console.error("SUPABASE_DRIFT_SCAN_FAILED")
    process.exit(1)
  }

  const paths = tracked.stdout.split("\0").filter(Boolean)
  const files = await Promise.all(
    paths.map(async (path) => ({ path, content: await readFile(path, "utf8") }))
  )
  const findings = scanSupabaseDrift(files)

  for (const finding of findings) {
    console.error(`${finding.ruleId} ${finding.path}`)
  }

  if (findings.length > 0) process.exit(1)
  console.log("Supabase environment drift check passed.")
}

main().catch(() => {
  console.error("SUPABASE_DRIFT_SCAN_FAILED")
  process.exit(1)
})