import "./_loadEnvFiles"
import { materializeSupabaseEnvironment } from "@/lib/config/supabaseEnvironmentRuntime"

materializeSupabaseEnvironment({ mode: "database-admin" })
