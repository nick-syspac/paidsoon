export type SupabaseDriftRuleId =
  | "SUPABASE_DRIFT_PROJECT_URL"
  | "SUPABASE_DRIFT_POOLER_HOST"
  | "SUPABASE_DRIFT_POSTGRES_URL"
  | "SUPABASE_DRIFT_LEGACY_ENV_READ"

export type SupabaseDriftFinding = {
  ruleId: SupabaseDriftRuleId
  path: string
}

type SourceFile = {
  path: string
  content: string
}

type DriftRule = {
  id: SupabaseDriftRuleId
  pattern: RegExp
  allowed: (path: string) => boolean
}

const isTestOrHistory = (path: string): boolean =>
  path.startsWith("tests/") ||
  path.startsWith("worker/tests/") ||
  path.startsWith("openspec/changes/") ||
  path.startsWith("prisma/migrations/")

const isEnvironmentExample = (path: string): boolean =>
  path === ".env.example" ||
  path === ".env.local.example" ||
  path === ".env.preview.example" ||
  path === ".env.production.example" ||
  path === "worker/.env.example"

const rules: DriftRule[] = [
  {
    id: "SUPABASE_DRIFT_PROJECT_URL",
    pattern: /https:\/\/[a-z0-9]{20}\.supabase\.co/,
    allowed: (path) => path === "config/supabase-environment-vectors.json" || isTestOrHistory(path),
  },
  {
    id: "SUPABASE_DRIFT_POOLER_HOST",
    pattern: /[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com/,
    allowed: (path) =>
      path === "config/supabase-environment.json" ||
      path === "config/supabase-environment-vectors.json" ||
      path === "worker/paidsoon_worker/supabase_environment.py" ||
      path === "docs/runbooks/supabase.md" ||
      isEnvironmentExample(path) ||
      isTestOrHistory(path),
  },
  {
    id: "SUPABASE_DRIFT_POSTGRES_URL",
    pattern: /postgres(?:ql)?:\/\//,
    allowed: (path) =>
      path === "config/supabase-environment-vectors.json" ||
      path === "lib/config/supabaseEnvironment.ts" ||
      path === "worker/paidsoon_worker/supabase_environment.py" ||
      path === "prisma.config.ts" ||
      isTestOrHistory(path),
  },
  {
    id: "SUPABASE_DRIFT_LEGACY_ENV_READ",
    pattern: /process\.env(?:\.(?:NEXT_PUBLIC_SUPABASE_URL|DATABASE_URL|DIRECT_URL)|\[(?:"|')(?:NEXT_PUBLIC_SUPABASE_URL|DATABASE_URL|DIRECT_URL)(?:"|')\])/,
    allowed: (path) =>
      path === "config/supabase-environment-vectors.json" ||
      path === "lib/config/supabaseEnvironmentRuntime.ts" ||
      path === "lib/supabase/client.ts" ||
      path === "scripts/db-reset-local.ts" ||
      path === "scripts/get-admin-devices.ts" ||
      path === "scripts/reset-myob-connection.ts" ||
      path === "scripts/run-psql.ts" ||
      path === "scripts/seed-admin-owner.ts" ||
      path === "scripts/seed-preview.ts" ||
      path === "scripts/seed/authUsers.ts" ||
      path === "scripts/verify-seed.ts" ||
      isTestOrHistory(path),
  },
]

export function scanSupabaseDrift(files: SourceFile[]): SupabaseDriftFinding[] {
  const findings: SupabaseDriftFinding[] = []
  for (const file of files) {
    for (const rule of rules) {
      if (!rule.allowed(file.path) && rule.pattern.test(file.content)) {
        findings.push({ ruleId: rule.id, path: file.path })
      }
    }
  }
  return findings.sort((left, right) =>
    left.path.localeCompare(right.path) || left.ruleId.localeCompare(right.ruleId)
  )
}