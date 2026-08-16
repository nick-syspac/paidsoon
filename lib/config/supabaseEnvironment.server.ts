import "server-only"

import {
  materializeSupabaseEnvironment,
  resolveSupabaseEnvironment,
  type ResolvedSupabaseEnvironment,
  type SupabaseEnvironmentMode,
} from "@/lib/config/supabaseEnvironmentRuntime"

type DatabaseMode = Exclude<SupabaseEnvironmentMode, "public" | "generate">

export function getServerSupabaseEnvironment(
  mode: DatabaseMode = "runtime"
): ResolvedSupabaseEnvironment {
  return resolveSupabaseEnvironment({ mode, env: process.env })
}

export function materializeServerSupabaseEnvironment(
  mode: DatabaseMode
): ResolvedSupabaseEnvironment {
  return materializeSupabaseEnvironment({ mode, env: process.env })
}