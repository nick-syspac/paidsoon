import { createTrialE2EPlan, TrialE2EPlanError } from "@/tests/helpers/trialAccessE2EPlan"

// Deliberately not a Next launcher. Do not import _loadEnv, Next, Prisma or SDKs.
// Read only explicitly piped non-secret JSON; never resolve a config/secret path.
async function main(): Promise<void> {
  if (process.argv.length !== 3 || process.argv[2] !== "--dry-run") {
    process.stderr.write("dry_run_only: only --dry-run with non-secret JSON on stdin is supported\n")
    process.exitCode = 2
    return
  }
  let text = ""
  for await (const chunk of process.stdin) {
    text += String(chunk)
    if (Buffer.byteLength(text) > 16_384) throw new Error("invalid_manifest")
  }
  const plan = createTrialE2EPlan(JSON.parse(text) as unknown)
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
}

void main().catch((error: unknown) => {
  const code = error instanceof TrialE2EPlanError ? error.code : "invalid_manifest"
  process.stderr.write(`${code}\n`)
  process.exitCode = 2
})